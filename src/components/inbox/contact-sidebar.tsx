"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { usePresence } from "@/hooks/use-presence";
import { presenceLabel, type PresenceStatus } from "@/lib/presence";
import { PresenceDot } from "@/components/presence/presence-dot";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { addContactTag, deleteContactTag } from "@/lib/contacts/tag-api";
import type {
  Contact,
  Conversation,
  Deal,
  ContactNote,
  Tag,
  ContactTag,
  Profile,
  PipelineStage,
} from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Building2,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Pencil,
  Trash2,
  X,
  Minus,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContactForm } from "@/components/contacts/contact-form";
import { format } from "date-fns";
import { enUS, ko, ptBR } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation?: Conversation | null;
  onAssignChange?: (conversationId: string, assignedAgentId: string | null) => void;
  onClose?: () => void;
  onContactUpdated?: (contact: Contact) => void;
  onContactDeleted?: (contactId: string) => void;
}

const DATE_LOCALES = { pt: ptBR, en: enUS, ko } as const;

export function ContactSidebar({
  contact,
  conversation,
  onAssignChange,
  onClose,
  onContactUpdated,
  onContactDeleted,
}: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");
  const tContacts = useTranslations("Contacts.page");
  const locale = useLocale();
  const dateLocale =
    DATE_LOCALES[locale as keyof typeof DATE_LOCALES] ?? ptBR;

  const { accountId, user } = useAuth();
  const { getPresence, getRow, now } = usePresence();
  const canEdit = useCan("send-messages");
  const canDelete = useCan("delete-records");
  const canCreateTags = useCan("edit-settings");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [accountTags, setAccountTags] = useState<Tag[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [savingTag, setSavingTag] = useState(false);
  const [movingDealId, setMovingDealId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [composingNote, setComposingNote] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openSections, setOpenSections] = useState({
    tags: true,
    deals: true,
    notes: true,
  });

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to fetch profiles:", error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("tags").select("*").order("name"),
      supabase.from("pipeline_stages").select("*").order("position"),
    ]).then(([tagsRes, stagesRes]) => {
      if (cancelled) return;
      if (!tagsRes.error) setAccountTags((tagsRes.data as Tag[]) ?? []);
      if (!stagesRes.error) setStages((stagesRes.data as PipelineStage[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  const handleAssign = useCallback(
    async (agentId: string | null) => {
      if (!canEdit || !conversation) return;
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", conversation.id);
      if (error) {
        console.error("Failed to update assignment:", error);
        toast.error(tThread("assignFailed"));
        return;
      }
      onAssignChange?.(conversation.id, agentId);
    },
    [canEdit, conversation, onAssignChange, tThread],
  );

  const refreshTags = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("tags").select("*").order("name");
    if (data) setAccountTags(data as Tag[]);
    await fetchContactData();
  }, [fetchContactData]);

  const handleToggleTag = useCallback(
    async (tag: Tag, attached: boolean) => {
      if (!canEdit || !contact) return;
      setSavingTag(true);
      try {
        if (attached) await deleteContactTag(contact.id, tag.id);
        else await addContactTag(contact.id, tag.id);
        await fetchContactData();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : tSidebar("tagFailed"));
      } finally {
        setSavingTag(false);
      }
    },
    [canEdit, contact, fetchContactData, tSidebar],
  );

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!canCreateTags || !canEdit || !contact || !name || !user?.id || !accountId) {
      return;
    }
    setSavingTag(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tags")
        .insert({
          user_id: user.id,
          account_id: accountId,
          name,
          color: "#00a0f0",
        })
        .select()
        .single();
      if (error) throw error;
      await addContactTag(contact.id, (data as Tag).id);
      setNewTagName("");
      toast.success(tSidebar("tagCreated"));
      await refreshTags();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tSidebar("tagFailed"));
    } finally {
      setSavingTag(false);
    }
  }, [accountId, canCreateTags, canEdit, contact, newTagName, refreshTags, tSidebar, user?.id]);

  const laterStagesFor = useCallback(
    (deal: Deal) => {
      const ordered = stages
        .filter((stage) => stage.pipeline_id === deal.pipeline_id)
        .sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((stage) => stage.id === deal.stage_id);
      if (index < 0) return [];
      return ordered.slice(index + 1);
    },
    [stages],
  );

  const handleAdvanceDeal = useCallback(
    async (deal: Deal, stage: PipelineStage) => {
      if (!canEdit || stage.id === deal.stage_id) return;
      setMovingDealId(deal.id);
      const supabase = createClient();
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: stage.id })
        .eq("id", deal.id);
      setMovingDealId(null);
      if (error) {
        toast.error(tSidebar("advanceFailed"));
        return;
      }
      setDeals((prev) =>
        prev.map((row) =>
          row.id === deal.id ? { ...row, stage_id: stage.id, stage } : row,
        ),
      );
      toast.success(tSidebar("advanced", { stage: stage.name }));
    },
    [canEdit, tSidebar],
  );

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!canEdit || !contact || !newNote.trim() || !accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
      setComposingNote(false);
    }
    setAddingNote(false);
  }, [canEdit, contact, newNote, accountId]);

  const handleSaved = useCallback(async () => {
    if (!contact) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contact.id)
      .maybeSingle();
    if (data) onContactUpdated?.(data as Contact);
    await fetchContactData();
  }, [contact, fetchContactData, onContactUpdated]);

  const handleDelete = useCallback(async () => {
    if (!canDelete || !contact) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id);
    setDeleting(false);
    if (error) {
      toast.error(tContacts("toastFailedDelete"));
      return;
    }
    toast.success(tContacts("toastDeleted"));
    setDeleteOpen(false);
    onContactDeleted?.(contact.id);
  }, [canDelete, contact, onContactDeleted, tContacts]);

  if (!contact) {
    return (
      <div className="flex h-full w-80 items-center justify-center border-l border-border bg-card">
        <p className="px-4 text-center text-sm text-muted-foreground">
          {tThread("selectConversation")}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();
  const contactTags: ContactTag[] = tags.map((tag) => ({
    id: tag.contact_tag_id,
    contact_id: contact.id,
    tag_id: tag.id,
  }));

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-border bg-card">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          {tSidebar("title")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={tSidebar("close")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-base font-semibold text-primary">
            {contact.avatar_url ? (
              <img
                src={contact.avatar_url}
                alt={displayName}
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {displayName}
          </h3>

          <div className="mt-3 space-y-2">
            <InfoRow icon={Mail} text={contact.email || tSidebar("unavailable")} />
            <InfoRow
              icon={Phone}
              text={contact.phone || tSidebar("unavailable")}
              action={
                contact.phone ? (
                  <button
                    type="button"
                    onClick={handleCopyPhone}
                    aria-label={contact.phone}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null
              }
            />
            <InfoRow
              icon={Building2}
              text={contact.company || tSidebar("unavailable")}
            />
          </div>

          {(canEdit || canDelete) && (
            <div className="mt-4 flex gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label={tSidebar("editContact")}
                  title={tSidebar("editContact")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  aria-label={tSidebar("deleteContact")}
                  title={tSidebar("deleteContact")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {conversation && (
            <AssigneeBlock
              conversation={conversation}
              profiles={profiles}
              canEdit={canEdit}
              currentUserId={user?.id}
              onAssign={handleAssign}
              presenceFor={(userId) => ({
                status: getPresence(userId),
                label: presenceLabel(
                  getPresence(userId),
                  getRow(userId)?.last_seen_at ?? null,
                  now,
                ),
              })}
            />
          )}

          <Section
            title={tSidebar("tags")}
            icon={TagIcon}
            open={openSections.tags}
            onToggle={() =>
              setOpenSections((prev) => ({ ...prev, tags: !prev.tags }))
            }
            collapseLabel={tSidebar("collapseSection", {
              section: tSidebar("tags"),
            })}
            expandLabel={tSidebar("expandSection", {
              section: tSidebar("tags"),
            })}
          >
            {tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">{tSidebar("noTags")}</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleToggleTag(tag, true)}
                        disabled={savingTag}
                        aria-label={tSidebar("removeTag", { name: tag.name })}
                        className="hover:opacity-70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {canEdit && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setTagPickerOpen((open) => !open)}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  {tSidebar("addTag")}
                </button>
                {tagPickerOpen && (
                  <div className="mt-2 space-y-2">
                    {accountTags.filter((tag) => !tags.some((row) => row.id === tag.id))
                      .length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {tSidebar("noMoreTags")}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {accountTags
                          .filter((tag) => !tags.some((row) => row.id === tag.id))
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              disabled={savingTag}
                              onClick={() => handleToggleTag(tag, false)}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80"
                              style={{
                                backgroundColor: `${tag.color}20`,
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </button>
                          ))}
                      </div>
                    )}
                    {canCreateTags && (
                      <div className="flex gap-2">
                        <Input
                          value={newTagName}
                          onChange={(event) => setNewTagName(event.target.value)}
                          placeholder={tSidebar("newTagPlaceholder")}
                          className="h-8 text-xs"
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void handleCreateTag();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-8"
                          disabled={!newTagName.trim() || savingTag}
                          onClick={() => void handleCreateTag()}
                        >
                          {tSidebar("createTag")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section
            title={tSidebar("deals")}
            icon={DollarSign}
            open={openSections.deals}
            onToggle={() =>
              setOpenSections((prev) => ({ ...prev, deals: !prev.deals }))
            }
            collapseLabel={tSidebar("collapseSection", {
              section: tSidebar("deals"),
            })}
            expandLabel={tSidebar("expandSection", {
              section: tSidebar("deals"),
            })}
          >
            {deals.length === 0 ? (
              <p className="text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
            ) : (
              <div className="space-y-2">
                {deals.map((deal) => {
                  const later = laterStagesFor(deal);
                  const moving = movingDealId === deal.id;
                  return (
                  <div key={deal.id} className="rounded-lg bg-muted px-3 py-2">
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(deal.value, deal.currency ?? "BRL")}</span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                    {canEdit && later.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          disabled={moving}
                          className="mt-2 flex h-8 w-full items-center justify-between rounded-lg border border-border bg-background px-2 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
                        >
                          <span>{tSidebar("advanceStage")}</span>
                          {moving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-56 border-border bg-popover"
                        >
                          {later.map((stage) => (
                            <DropdownMenuItem
                              key={stage.id}
                              onClick={() => void handleAdvanceDeal(deal, stage)}
                              className="text-sm text-popover-foreground"
                            >
                              {tSidebar("advanceTo", { stage: stage.name })}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section
            title={tSidebar("notes")}
            icon={StickyNote}
            open={openSections.notes}
            onToggle={() =>
              setOpenSections((prev) => ({ ...prev, notes: !prev.notes }))
            }
            collapseLabel={tSidebar("collapseSection", {
              section: tSidebar("notes"),
            })}
            expandLabel={tSidebar("expandSection", {
              section: tSidebar("notes"),
            })}
          >
            {canEdit && !composingNote && (
              <button
                type="button"
                onClick={() => setComposingNote(true)}
                className="mb-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                {tSidebar("addNote")}
              </button>
            )}
            {canEdit && composingNote && (
              <div className="mb-2 flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted px-3 py-2">
                  <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {note.note_text}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {format(new Date(note.created_at), "d MMM yyyy HH:mm", {
                      locale: dateLocale,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </ScrollArea>

      {canEdit && (
        <ContactForm
          open={editOpen}
          onOpenChange={setEditOpen}
          contact={contact}
          contactTags={contactTags}
          onSaved={handleSaved}
        />
      )}

      {canDelete && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{tContacts("deleteContactTitle")}</DialogTitle>
              <DialogDescription>
                {tContacts("deleteContactDesc", {
                  name: contact.name || contact.phone,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                {tContacts("cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                {tContacts("deleteBtn")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AssigneeBlock({
  conversation,
  profiles,
  canEdit,
  currentUserId,
  onAssign,
  presenceFor,
}: {
  conversation: Conversation;
  profiles: Profile[];
  canEdit: boolean;
  currentUserId?: string;
  onAssign: (agentId: string | null) => void;
  presenceFor: (userId: string) => { status: PresenceStatus; label: string };
}) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");
  const assignedId = conversation.assigned_agent_id ?? null;
  const assignee = profiles.find((p) => p.user_id === assignedId);
  const label =
    assignee?.full_name ??
    (assignedId ? tThread("assigned") : tSidebar("none"));
  const canTake =
    canEdit && !!currentUserId && currentUserId !== assignedId;

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="text-sm font-medium text-foreground">
        {tSidebar("conversationActions")}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{tSidebar("assignee")}</span>
        {canTake && (
          <button
            type="button"
            onClick={() => onAssign(currentUserId)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {tSidebar("assignToMe")}
          </button>
        )}
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="mt-2 flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-muted px-2 text-sm text-foreground hover:bg-muted/80">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-medium">
              {label.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 border-border bg-popover">
            {profiles.length === 0 ? (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                {tThread("noTeammates")}
              </DropdownMenuItem>
            ) : (
              profiles.map((p) => {
                const selected = p.user_id === assignedId;
                const presence = presenceFor(p.user_id);
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => onAssign(p.user_id)}
                    className={cn(
                      "text-sm",
                      selected ? "text-primary" : "text-popover-foreground",
                    )}
                  >
                    <PresenceDot
                      status={presence.status}
                      label={presence.label}
                      className="mr-2"
                    />
                    <span className="flex-1">
                      {p.full_name}
                      {p.user_id === currentUserId ? tThread("me") : ""}
                    </span>
                    {selected && <Check className="ml-2 h-3 w-3" />}
                  </DropdownMenuItem>
                );
              })
            )}
            {assignedId && (
              <>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  onClick={() => onAssign(null)}
                  className="text-sm text-muted-foreground"
                >
                  {tThread("unassign")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <p className="mt-2 text-sm text-foreground">{label}</p>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  text,
  action,
}: {
  icon: typeof Mail;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {action}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  open,
  onToggle,
  collapseLabel,
  expandLabel,
  children,
}: {
  title: string;
  icon: typeof Mail;
  open: boolean;
  onToggle: () => void;
  collapseLabel: string;
  expandLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? collapseLabel : expandLabel}
        className="flex w-full items-center gap-2 text-left text-sm font-medium text-foreground"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        {open ? (
          <Minus className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && <div className={cn("mt-3")}>{children}</div>}
    </div>
  );
}
