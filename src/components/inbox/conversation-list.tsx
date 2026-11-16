"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversation,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import { Search, ChevronDown, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const PAGE_SIZE = 40;

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};



type InboxFilter = ConversationStatus | "all" | "unread";

const URL_STATUSES: readonly InboxFilter[] = ["open", "pending", "closed"];

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  
  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  // Deep links from the dashboard: ?status=open opens that status, and
  // ?agent=<auth user id> keeps only that agent's conversations.
  const searchParams = useSearchParams();
  const agentParam = searchParams.get("agent");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>(() => {
    const status = searchParams.get("status") as InboxFilter | null;
    return status && URL_STATUSES.includes(status) ? status : "all";
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const cursorRef = useRef<string | null>(null);
  const conversationsRef = useRef(conversations);
  const searchParamsRef = useRef(searchParams);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
    conversationsRef.current = conversations;
    searchParamsRef.current = searchParams;
  });

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const loadPage = useCallback(async (cursor: string | null) => {
    const supabase = createClient();
    let contactIds: string[] | null = null;
    const intersect = (current: string[] | null, next: string[]) =>
      current ? next.filter((id) => current.includes(id)) : next;
    const token = debouncedSearch.replace(/[,()]/g, " ").trim();
    if (token) {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .or(`name.ilike.%${token}%,phone.ilike.%${token}%,company.ilike.%${token}%`)
        .limit(300);
      contactIds = intersect(contactIds, ((data ?? []) as { id: string }[]).map((row) => row.id));
    }
    if (selectedCompany) {
      const { data } = await supabase
        .from("contacts")
        .select("id")
        .eq("company", selectedCompany)
        .limit(500);
      contactIds = intersect(contactIds, ((data ?? []) as { id: string }[]).map((row) => row.id));
    }
    if (selectedTagIds.length > 0) {
      const { data } = await supabase
        .from("contact_tags")
        .select("contact_id")
        .in("tag_id", selectedTagIds)
        .limit(500);
      const ids = [
        ...new Set(((data ?? []) as { contact_id: string }[]).map((row) => row.contact_id)),
      ];
      contactIds = intersect(contactIds, ids);
    }
    if (contactIds && contactIds.length === 0 && !token) {
      return { rows: [] as Conversation[], cursor: null, hasMore: false };
    }

    let query = supabase
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(PAGE_SIZE);
    if (filter === "unread") query = query.gt("unread_count", 0);
    else if (filter !== "all") query = query.eq("status", filter);
    if (agentParam) query = query.eq("assigned_agent_id", agentParam);
    if (cursor) query = query.lt("last_message_at", cursor);
    if (token) {
      const parts = [`last_message_text.ilike.%${token}%`];
      if (contactIds && contactIds.length > 0) {
        parts.push(`contact_id.in.(${contactIds.join(",")})`);
      }
      query = query.or(parts.join(","));
    } else if (contactIds) {
      query = query.in("contact_id", contactIds);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Failed to fetch conversations:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return { rows: [] as Conversation[], cursor, hasMore: false, error: true as const };
    }
    const rows = normalizeConversations(data ?? []);
    const lastAt = rows[rows.length - 1]?.last_message_at ?? null;
    return {
      rows,
      cursor: lastAt,
      hasMore: rows.length === PAGE_SIZE && Boolean(lastAt),
    };
  }, [agentParam, debouncedSearch, filter, selectedCompany, selectedTagIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const page = await loadPage(null);
      if (cancelled) return;
      if ("error" in page && page.error) {
        setLoading(false);
        return;
      }
      let rows = page.rows;
      const deepId = searchParamsRef.current.get("c");
      if (deepId && !rows.some((row) => row.id === deepId)) {
        const supabase = createClient();
        const { data } = await supabase
          .from("conversations")
          .select(CONVERSATION_SELECT)
          .eq("id", deepId)
          .maybeSingle();
        if (data) rows = [normalizeConversation(data), ...rows];
      }
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      onConversationsLoadedRef.current(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // resyncToken forces a fresh first page after a reconnect or a tab focus.
  }, [loadPage, resyncToken]);

  const loadMore = useCallback(async () => {
    if (!cursorRef.current || loadingMore) return;
    setLoadingMore(true);
    const page = await loadPage(cursorRef.current);
    if ("error" in page && page.error) {
      setLoadingMore(false);
      return;
    }
    const seen = new Set(conversationsRef.current.map((conversation) => conversation.id));
    const merged = [...conversationsRef.current];
    for (const row of page.rows) {
      if (!seen.has(row.id)) merged.push(row);
    }
    cursorRef.current = page.cursor;
    setHasMore(page.hasMore);
    onConversationsLoadedRef.current(merged);
    setLoadingMore(false);
  }, [loadPage, loadingMore]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options come from contacts, not from the loaded page, so the
  // filter still lists companies whose conversation is not on screen yet.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("contacts")
        .select("company")
        .not("company", "is", null)
        .limit(400);
      if (cancelled) return;
      const names = new Set<string>();
      for (const row of (data ?? []) as { company: string | null }[]) {
        const company = row.company?.trim();
        if (company) names.add(company);
      }
      setCompanies(Array.from(names).sort((a, b) => a.localeCompare(b)));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    if (agentParam) {
      result = result.filter((c) => c.assigned_agent_id === agentParam);
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, agentParam, search, selectedTagIds, selectedCompany]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                {activeFilter?.label ?? t("filterAll")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                t={t}
              />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="px-4 py-3 text-center text-xs font-medium text-primary hover:bg-muted disabled:opacity-60"
              >
                {loadingMore ? "…" : t("loadMore")}
              </button>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : "";

  const statusLabel =
    conversation.status === "pending"
      ? t("statusPending")
      : conversation.status === "closed"
        ? t("statusClosed")
        : t("statusOpen");

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full flex-col items-start gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70"
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-left text-lg font-semibold leading-tight text-foreground">
          {displayName}
        </span>
        <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{timeAgo}</span>
      </div>
      <div className="flex w-full items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-left text-sm text-muted-foreground">
          {conversation.last_message_text || t("noMessagesYet")}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {conversation.unread_count > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {conversation.unread_count}
            </span>
          )}
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              STATUS_COLORS[conversation.status]
            )}
            title={statusLabel}
          />
        </div>
      </div>
    </button>
  );
}
