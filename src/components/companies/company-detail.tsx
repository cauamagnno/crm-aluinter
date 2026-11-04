"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Plus,
  Star,
} from "lucide-react";

import { ContactForm } from "@/components/contacts/contact-form";
import { DealForm } from "@/components/pipelines/deal-form";
import { DealTaskForm } from "@/components/pipelines/deal-task-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_CURRENCY, formatCurrency } from "@/lib/currency";
import { dealDisplayStatus } from "@/lib/pipelines/status";
import type {
  Contact,
  ContactNote,
  Deal,
  DealDisplayStatus,
  DealTask,
  Pipeline,
  PipelineStage,
  Profile,
} from "@/types";

type HistoryKind =
  | "dealCreated"
  | "dealStage"
  | "dealStatus"
  | "tag"
  | "note"
  | "taskCreated"
  | "taskDone";

type HistoryRow = {
  id: string;
  at: string;
  kind: HistoryKind;
  text: string;
  status?: DealDisplayStatus;
};

function money(value: number, currency = DEFAULT_CURRENCY) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency || DEFAULT_CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return formatCurrency(value, currency);
  }
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-0.5 text-sky-500" aria-hidden>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={`size-3.5 ${index < count ? "fill-current" : "opacity-30"}`}
        />
      ))}
    </span>
  );
}

export function CompanyDetail({ contactId }: { contactId: string }) {
  const t = useTranslations("Empresas.detail");
  const tStatus = useTranslations("Pipelines.status");
  const router = useRouter();
  const supabase = createClient();
  const { accountId, user } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState("");
  const [segment, setSegment] = useState("");
  const [url, setUrl] = useState("");
  const [address, setAddress] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(true);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [associates, setAssociates] = useState<Contact[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [nextTaskByDeal, setNextTaskByDeal] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const loadedId = useRef<string | null>(null);
  const [tab, setTab] = useState<"deals" | "history">("deals");
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskDeal, setTaskDeal] = useState<Deal | null>(null);

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!contactId) {
      setLoading(false);
      setContact(null);
      return;
    }
    if (loadedId.current !== contactId) setLoading(true);
    const [{ data: row }, { data: people }, { data: pipes }] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("pipelines").select("*").order("created_at"),
    ]);
    const current = (row as Contact | null) ?? null;
    setContact(current);
    setProfiles((people as Profile[]) ?? []);
    const pipeRows = (pipes as Pipeline[]) ?? [];
    setPipelines(pipeRows);
    if (!current) {
      setLoading(false);
      return;
    }
    setCompany(current.company ?? "");
    setSegment(current.company_segment ?? "");
    setUrl(current.company_url ?? "");
    setAddress(current.company_address ?? "");
    setOwnerId(current.assigned_to ?? "");

    const companyName = (current.company ?? "").trim();
    const { data: sameCompany } = companyName
      ? await supabase.from("contacts").select("*").ilike("company", companyName)
      : { data: [current] };
    const related = ((sameCompany as Contact[]) ?? [current]).filter(Boolean);
    const ids = [...new Set([current.id, ...related.map((item) => item.id)])];
    setAssociates(related.filter((item) => item.id !== current.id));

    const pipelineId = pipeRows[0]?.id;
    const stageQuery = pipelineId
      ? supabase
          .from("pipeline_stages")
          .select("*")
          .eq("pipeline_id", pipelineId)
          .order("position")
      : Promise.resolve({ data: [] as PipelineStage[] });

    const [notesRes, dealsRes, stageRes] = await Promise.all([
      supabase
        .from("contact_notes")
        .select("*")
        .in("contact_id", ids)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(id, name, position, color), contact:contacts(id, name)")
        .in("contact_id", ids)
        .order("created_at", { ascending: false }),
      stageQuery,
    ]);

    const noteRows = (notesRes.data as ContactNote[]) ?? [];
    const dealRows = (dealsRes.data as Deal[]) ?? [];
    setNotes(noteRows);
    setDeals(dealRows);
    setStages((stageRes.data as PipelineStage[]) ?? []);

    const dealIds = dealRows.map((deal) => deal.id);
    const [taskRes, tagRes] = await Promise.all([
      dealIds.length
        ? supabase
            .from("deal_tasks")
            .select("id, deal_id, title, due_at, done_at, created_at")
            .in("deal_id", dealIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as DealTask[] }),
      supabase
        .from("contact_tags")
        .select("id, created_at, tag:tags(id, name)")
        .in("contact_id", ids),
    ]);
    const taskRows = (taskRes.data as DealTask[]) ?? [];
    const next: Record<string, string> = {};
    const openTasks = [...taskRows]
      .filter((task) => !task.done_at)
      .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
    for (const task of openTasks) {
      if (!next[task.deal_id]) next[task.deal_id] = task.title;
    }
    setNextTaskByDeal(next);

    const tagRows = (tagRes.data ?? []) as Array<{
      id: string;
      created_at?: string;
      tag?: { name?: string } | Array<{ name?: string }> | null;
    }>;

    const rows: HistoryRow[] = [
      ...noteRows.map((note) => ({
        id: `note-${note.id}`,
        at: note.created_at,
        kind: "note" as const,
        text: note.note_text,
      })),
      ...tagRows.flatMap((row) => {
        const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const name = tag?.name?.trim();
        if (!name) return [];
        return [
          {
            id: `tag-${row.id}`,
            at: row.created_at || new Date(0).toISOString(),
            kind: "tag" as const,
            text: name,
          },
        ];
      }),
    ];
    for (const deal of dealRows) {
      const stage = one(deal.stage as Deal["stage"] | Deal["stage"][] | null);
      const status = dealDisplayStatus(deal);
      rows.push({
        id: `deal-${deal.id}`,
        at: deal.created_at,
        kind: "dealCreated",
        text: deal.title,
      });
      if (stage?.name) {
        rows.push({
          id: `stage-${deal.id}`,
          at: deal.updated_at || deal.created_at,
          kind: "dealStage",
          text: `${stage.name} · ${deal.title}`,
        });
      }
      rows.push({
        id: `status-${deal.id}`,
        at:
          status === "won" || status === "lost"
            ? deal.closed_at || deal.updated_at || deal.created_at
            : deal.updated_at || deal.created_at,
        kind: "dealStatus",
        text: deal.title,
        status,
      });
    }
    for (const task of taskRows) {
      rows.push({
        id: `task-${task.id}`,
        at: task.created_at,
        kind: "taskCreated",
        text: task.title,
      });
      if (task.done_at) {
        rows.push({
          id: `task-done-${task.id}`,
          at: task.done_at,
          kind: "taskDone",
          text: task.title,
        });
      }
    }
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setHistory(rows);
    loadedId.current = contactId;
    setLoading(false);
  }, [contactId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const owner = profiles.find((profile) => profile.id === ownerId);
  const ownerName = owner?.full_name?.trim() || owner?.email || t("none");

  const metrics = useMemo(() => {
    const open = deals.filter((deal) => dealDisplayStatus(deal) === "open");
    const won = deals.filter((deal) => deal.status === "won");
    const lost = deals.filter((deal) => deal.status === "lost");
    const sum = (rows: Deal[]) => rows.reduce((total, deal) => total + (Number(deal.value) || 0), 0);
    const wonValue = sum(won);
    const days = won
      .map((deal) => {
        if (!deal.closed_at) return null;
        const diff = new Date(deal.closed_at).getTime() - new Date(deal.created_at).getTime();
        return diff > 0 ? diff / 86_400_000 : 0;
      })
      .filter((value): value is number => value != null);
    const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
    return {
      openValue: sum(open),
      wonValue,
      lostValue: sum(lost),
      count: deals.length,
      ticket: won.length ? wonValue / won.length : 0,
      avgDays,
    };
  }, [deals]);

  const currency = deals[0]?.currency || DEFAULT_CURRENCY;
  const activeDeals = deals.filter((deal) => {
    const status = dealDisplayStatus(deal);
    return status === "open" || status === "paused";
  });
  const closedDeals = deals.filter((deal) => {
    const status = dealDisplayStatus(deal);
    return status === "won" || status === "lost";
  });

  async function saveProfile(nextOwnerId = ownerId) {
    if (!contact || !company.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({
        company: company.trim(),
        name: contact.name?.trim() || company.trim(),
        company_segment: segment.trim() || null,
        company_url: url.trim() || null,
        company_address: address.trim() || null,
        assigned_to: nextOwnerId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contact.id);
    setSaving(false);
    if (error) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
    void load();
  }

  async function addNote() {
    if (!contact || !noteText.trim() || !user || !accountId) return;
    setSavingNote(true);
    const { error } = await supabase.from("contact_notes").insert({
      contact_id: contact.id,
      account_id: accountId,
      user_id: user.id,
      note_text: noteText.trim(),
    });
    setSavingNote(false);
    if (error) {
      toast.error(t("saveFailed"));
      return;
    }
    setNoteText("");
    void load();
  }

  function statusWord(status: DealDisplayStatus) {
    if (status === "won") return tStatus("won");
    if (status === "lost") return tStatus("lostFemale");
    if (status === "paused") return tStatus("paused");
    return tStatus("open");
  }

  function statusLabel(deal: Deal) {
    return statusWord(dealDisplayStatus(deal));
  }

  function statusClass(deal: Deal) {
    const status = dealDisplayStatus(deal);
    if (status === "won") return "bg-emerald-100 text-emerald-700";
    if (status === "lost") return "bg-rose-100 text-rose-700";
    if (status === "paused") return "bg-amber-100 text-amber-800";
    return "bg-sky-100 text-sky-700";
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  if (!contact) {
    return <p className="text-sm text-muted-foreground">{t("notFound")}</p>;
  }

  const pipeline = pipelines[0];
  const firstStage = stages[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-1 text-muted-foreground"
            onClick={() => router.push("/empresas")}
            aria-label={t("back")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">{t("label")}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{company || contact.company || contact.name}</h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (deals.length === 0) {
                toast.error(t("needDeal"));
                return;
              }
              setTaskDeal(null);
              setTaskFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("createTask")}
          </Button>
          <Button
            className="bg-sky-600 text-white hover:bg-sky-700"
            onClick={() => {
              if (!pipeline) {
                toast.error(t("noPipeline"));
                return;
              }
              setDealFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            {t("createDeal")}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3">
          <section className="rounded-xl bg-muted/40 p-3">
            <h2 className="px-2 py-1 text-sm font-semibold">{t("label")}</h2>
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium"
              onClick={() => setCadastroOpen((open) => !open)}
            >
              {t("cadastro")}
              <ChevronDown className={`size-4 transition ${cadastroOpen ? "rotate-180" : ""}`} />
            </button>
            {cadastroOpen && (
              <div className="space-y-3 px-2 pb-3">
                <Field label={`${t("company")} *`}>
                  <Input value={company} onChange={(event) => setCompany(event.target.value)} />
                </Field>
                <Field label={t("segment")}>
                  <Input value={segment} onChange={(event) => setSegment(event.target.value)} />
                </Field>
                <Field label={t("url")}>
                  <Input value={url} onChange={(event) => setUrl(event.target.value)} />
                </Field>
                <Field label={t("address")}>
                  <Input value={address} onChange={(event) => setAddress(event.target.value)} />
                </Field>
                <Button size="sm" onClick={() => void saveProfile()} disabled={saving || !company.trim()}>
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            )}
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-2 text-sm font-medium"
              onClick={() => setNotesOpen((open) => !open)}
            >
              {t("notes")}
              <ChevronDown className={`size-4 transition ${notesOpen ? "rotate-180" : ""}`} />
            </button>
            {notesOpen && (
              <div className="space-y-2 px-2 pb-3">
                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("noNotes")}</p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((note) => (
                      <li key={note.id} className="rounded-lg bg-background px-2 py-1.5 text-sm">
                        {note.note_text}
                      </li>
                    ))}
                  </ul>
                )}
                <Textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder={t("notePlaceholder")}
                  className="min-h-16 bg-background"
                />
                <Button size="sm" variant="outline" disabled={savingNote || !noteText.trim()} onClick={() => void addNote()}>
                  {t("addNote")}
                </Button>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-muted/40 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between px-2 py-1 text-sm font-semibold"
              onClick={() => setContactsOpen((open) => !open)}
            >
              {t("associated")}
              <ChevronDown className={`size-4 transition ${contactsOpen ? "rotate-180" : ""}`} />
            </button>
            {contactsOpen && (
              <div className="space-y-2 px-2 pt-2">
                {associates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("noContacts")}</p>
                ) : (
                  associates.map((person) => (
                    <Link
                      key={person.id}
                      href={`/contacts/${person.id}`}
                      className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-background"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-sky-100 text-[10px] font-semibold text-sky-700">
                        {initials(person.name || person.company)}
                      </span>
                      {person.name || person.company}
                    </Link>
                  ))
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-sky-700"
                  onClick={() => setContactFormOpen(true)}
                >
                  <Plus className="size-3.5" />
                  {t("addContact")}
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl bg-muted/40 p-4">
            <h2 className="text-sm font-semibold">{t("attributions")}</h2>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("followers")}</span>
              <span>{ownerName}</span>
              <span className="text-muted-foreground">{t("owner")} *</span>
              <Select
                value={ownerId || "none"}
                onValueChange={(value) => {
                  const next = !value || value === "none" ? "" : value;
                  setOwnerId(next);
                  void saveProfile(next);
                }}
              >
                <SelectTrigger className="h-8 w-full bg-background text-foreground">
                  <SelectValue>{ownerName}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" className="max-h-72">
                  <SelectItem value="none">{t("none")}</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <section className="min-w-0">
          <div className="flex gap-4 border-b border-border">
            <TabButton active={tab === "deals"} onClick={() => setTab("deals")}>
              {t("tabDeals")}
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              {t("tabHistory")}
            </TabButton>
          </div>

          {tab === "deals" ? (
            <div className="space-y-4 pt-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label={t("openValue")} value={money(metrics.openValue, currency)} tone="open" />
                <Metric label={t("wonValue")} value={money(metrics.wonValue, currency)} tone="won" />
                <Metric label={t("lostValue")} value={money(metrics.lostValue, currency)} tone="lost" />
                <Metric label={t("dealCount")} value={String(metrics.count)} />
                <Metric label={t("avgTicket")} value={money(metrics.ticket, currency)} />
                <Metric label={t("avgDays")} value={t("days", { count: metrics.avgDays })} />
              </div>

              <DealGroup
                title={t("activeDeals")}
                empty={t("noActive")}
                rows={activeDeals}
                profiles={profiles}
                currency={currency}
                nextTaskByDeal={nextTaskByDeal}
                noContact={t("noContact")}
                noTask={t("noTask")}
                createTask={t("createTask")}
                statusLabel={statusLabel}
                statusClass={statusClass}
                onCreateTask={(deal) => {
                  setTaskDeal(deal);
                  setTaskFormOpen(true);
                }}
              />
              <DealGroup
                title={t("closedDeals")}
                empty={t("noClosed")}
                rows={closedDeals}
                profiles={profiles}
                currency={currency}
                nextTaskByDeal={nextTaskByDeal}
                noContact={t("noContact")}
                noTask={t("noTask")}
                createTask={t("createTask")}
                statusLabel={statusLabel}
                statusClass={statusClass}
                onCreateTask={(deal) => {
                  setTaskDeal(deal);
                  setTaskFormOpen(true);
                }}
              />
            </div>
          ) : (
            <ul className="space-y-2 pt-4">
              {history.length === 0 ? (
                <li className="text-sm text-muted-foreground">{t("noHistory")}</li>
              ) : (
                history.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-medium text-sky-700">{t(item.kind)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(item.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {item.text ? (
                      <p className="mt-0.5 text-sm">
                        {item.kind === "dealStatus" && item.status
                          ? `${statusWord(item.status)} · ${item.text}`
                          : item.text}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          )}
        </section>
      </div>

      {pipeline && (
        <DealForm
          open={dealFormOpen}
          onOpenChange={setDealFormOpen}
          pipelineId={pipeline.id}
          stages={stages}
          defaultStageId={firstStage?.id}
          initialContactId={contact.id}
          onSaved={() => void load()}
        />
      )}

      <DealTaskForm
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        deal={taskDeal}
        deals={deals}
        profiles={profiles}
        onSaved={() => void load()}
      />

      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        defaultCompany={company || contact.company || ""}
        onSaved={() => void load()}
        onCreated={() => void load()}
      />
    </div>
  );
}

function DealGroup({
  title,
  empty,
  rows,
  profiles,
  currency,
  nextTaskByDeal,
  noContact,
  noTask,
  createTask,
  statusLabel,
  statusClass,
  onCreateTask,
}: {
  title: string;
  empty: string;
  rows: Deal[];
  profiles: Profile[];
  currency: string;
  nextTaskByDeal: Record<string, string>;
  noContact: string;
  noTask: string;
  createTask: string;
  statusLabel: (deal: Deal) => string;
  statusClass: (deal: Deal) => string;
  onCreateTask: (deal: Deal) => void;
}) {
  const columns = useTranslations("Empresas.detail");
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        {title}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-[24%] px-1.5 py-2 text-left font-medium leading-tight">{columns("colNextTask")}</th>
                <th className="w-[22%] px-1.5 py-2 text-left font-medium leading-tight" />
                <th className="w-[12%] px-1.5 py-2 text-left font-medium leading-tight">{columns("colOwner")}</th>
                <th className="w-[14%] px-1.5 py-2 text-left font-medium leading-tight">{columns("colQualification")}</th>
                <th className="w-[14%] px-1.5 py-2 text-left font-medium leading-tight">{columns("colStatus")}</th>
                <th className="px-1.5 py-2 text-left font-medium leading-tight">{columns("colValue")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((deal) => {
                const seller = profiles.find((profile) => profile.id === deal.assigned_to);
                const person = one(deal.contact)?.name?.trim();
                const stage = one(deal.stage);
                const stars = Math.min(5, Math.max(1, (stage?.position ?? 0) + 1));
                return (
                  <tr key={deal.id} className="border-t border-border">
                    <td className="px-2 py-3">
                      <p className="truncate font-medium text-foreground">{nextTaskByDeal[deal.id] || noTask}</p>
                      <button
                        type="button"
                        className="text-xs font-medium text-sky-700"
                        onClick={() => onCreateTask(deal)}
                      >
                        {createTask}
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/pipelines/${deal.id}`} className="block hover:text-sky-700">
                        <p className="truncate font-medium">{deal.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{person || noContact}</p>
                      </Link>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
                        title={seller?.full_name || seller?.email || ""}
                      >
                        {initials(seller?.full_name || seller?.email)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <Stars count={stars} />
                    </td>
                    <td className="px-2 py-3">
                      <span className={`inline-block rounded px-1.5 py-1 text-[10px] font-semibold uppercase leading-tight ${statusClass(deal)}`}>
                        {statusLabel(deal)}
                      </span>
                    </td>
                    <td className="px-1.5 py-3">{money(deal.value, deal.currency || currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "open" | "won" | "lost";
}) {
  const toneClass =
    tone === "open"
      ? "bg-sky-50"
      : tone === "won"
        ? "bg-emerald-50"
        : tone === "lost"
          ? "bg-rose-50"
          : "bg-muted/50";
  return (
    <div className={`rounded-xl px-4 py-3 ${toneClass}`}>
      <p className={`text-xs ${tone ? "text-slate-600" : "text-muted-foreground"}`}>{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone ? "text-slate-950" : ""}`}>{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-2 text-sm font-medium ${
        active ? "border-sky-600 text-sky-700" : "border-transparent text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
