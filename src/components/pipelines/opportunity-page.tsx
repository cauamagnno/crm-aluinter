"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, ThumbsDown, ThumbsUp, X } from "lucide-react";

import { ContactForm } from "@/components/contacts/contact-form";
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
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { dealStatusPatch } from "@/lib/pipelines/close-deal";
import { dealDisplayStatus } from "@/lib/pipelines/status";
import type { Deal, DealTask, Pipeline, PipelineStage, Profile } from "@/types";

const DEAL_PRODUCTS = [
  "ACM",
  "AC. DE ACM",
  "AÇO INOX",
  "AC. DE INOX",
  "POLICARBONATO",
  "AC. DE POLICARBONATO",
] as const;

type DealEvent = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
};

function daysSince(iso?: string | null) {
  if (!iso) return 0;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

function warmKey(position: number): "warm0" | "warm1" | "warm2" | "warm3" | "warm4" {
  if (position <= 0) return "warm0";
  if (position === 1) return "warm1";
  if (position === 2) return "warm2";
  if (position === 3) return "warm3";
  return "warm4";
}

export function OpportunityPage({ dealId }: { dealId: string }) {
  const t = useTranslations("Pipelines.opportunity");
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<DealTask[]>([]);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [tab, setTab] = useState<"history" | "tasks" | "products">("tasks");
  const [tipOpen, setTipOpen] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!dealId) {
      setDeal(null);
      setLoading(false);
      return;
    }
    const { data: row } = await supabase
      .from("deals")
      .select("*, contact:contacts(*), pipeline:pipelines(id, name)")
      .eq("id", dealId)
      .maybeSingle();
    const current = (row as (Deal & { pipeline?: Pipeline | Pipeline[] | null }) | null) ?? null;
    setDeal(current);
    if (!current) {
      setLoading(false);
      return;
    }
    setTitle(current.title);
    setValue(String(current.value ?? ""));
    setCloseDate((current.expected_close_date ?? "").slice(0, 10));
    setOwnerId(current.assigned_to ?? "");
    const embeddedPipeline = current.pipeline;
    const pipe = Array.isArray(embeddedPipeline) ? embeddedPipeline[0] : embeddedPipeline;
    setPipeline(pipe ?? null);

    const [stageRes, taskRes, eventRes, peopleRes] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", current.pipeline_id)
        .order("position"),
      supabase.from("deal_tasks").select("*").eq("deal_id", current.id).order("due_at"),
      supabase
        .from("deal_events")
        .select("id, kind, message, created_at")
        .eq("deal_id", current.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    setStages((stageRes.data as PipelineStage[]) ?? []);
    setTasks((taskRes.data as DealTask[]) ?? []);
    setEvents((eventRes.data as DealEvent[]) ?? []);
    setProfiles((peopleRes.data as Profile[]) ?? []);
    setLoading(false);
  }, [dealId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const actor = profile?.full_name?.trim() || profile?.email || t("none");
  const contact = deal?.contact;
  const stage = stages.find((item) => item.id === deal?.stage_id);
  const pipelineName = pipeline?.name || t("none");
  const openTasks = tasks.filter((task) => !task.done_at);
  const isNew = deal ? daysSince(deal.created_at) < 2 : false;

  async function record(kind: string, message: string) {
    if (!deal?.account_id) return;
    await supabase.from("deal_events").insert({
      account_id: deal.account_id,
      deal_id: deal.id,
      actor_id: profile?.id ?? null,
      kind,
      message,
    });
  }

  async function save(patch: Record<string, unknown>) {
    if (!deal) return;
    const { error } = await supabase
      .from("deals")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) {
      toast.error(t("saveFailed"));
      return;
    }
    toast.success(t("saved"));
    void load();
  }

  async function moveStage(next: PipelineStage) {
    if (!deal || next.id === deal.stage_id || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("deals")
      .update({ stage_id: next.id, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) {
      setBusy(false);
      toast.error(t("saveFailed"));
      return;
    }
    await record(
      "stage",
      t("stageChanged", { name: actor, stage: next.name, pipeline: pipelineName }),
    );
    setBusy(false);
    void load();
  }

  async function toggleProduct(name: string) {
    if (!deal) return;
    const current = Array.isArray(deal.products) ? deal.products : [];
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    setDeal({ ...deal, products: next });
    const { error } = await supabase.from("deals").update({ products: next }).eq("id", deal.id);
    if (error) {
      toast.error(t("saveFailed"));
      void load();
    }
  }

  async function mark(status: "won" | "lost") {
    if (!deal || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("deals")
      .update({ ...dealStatusPatch(status), paused: false, updated_at: new Date().toISOString() })
      .eq("id", deal.id);
    if (error) {
      setBusy(false);
      toast.error(t("statusFailed"));
      return;
    }
    await record("status", status === "won" ? t("markedWon", { name: actor }) : t("markedLost", { name: actor }));
    setBusy(false);
    void load();
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  if (!deal) {
    return <p className="text-sm text-muted-foreground">{t("notFound")}</p>;
  }

  const history: DealEvent[] = [...events];
  if (!events.some((event) => event.kind === "created")) {
    history.push({
      id: "created",
      kind: "created",
      message: t("created"),
      created_at: deal.created_at,
    });
  }
  if (!events.some((event) => event.kind === "stage") && stage) {
    history.push({
      id: "stage-now",
      kind: "stage",
      message: t("stageNow", { stage: stage.name, pipeline: pipelineName }),
      created_at: deal.updated_at || deal.created_at,
    });
  }
  history.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const ownerName =
    profiles.find((person) => person.id === ownerId)?.full_name ||
    profiles.find((person) => person.id === ownerId)?.email ||
    t("none");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="mt-1 text-muted-foreground"
            onClick={() => router.back()}
            aria-label={t("back")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <p className="text-xs text-muted-foreground">{title || deal.title}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{title || deal.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {isNew ? (
                <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  {t("newBadge")}
                </span>
              ) : null}
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                {pipelineName}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void mark("lost")}>
            <ThumbsDown className="size-4" />
            {t("markLost")}
          </Button>
          <Button className="bg-sky-600 text-white hover:bg-sky-700" disabled={busy} onClick={() => void mark("won")}>
            <ThumbsUp className="size-4" />
            {t("markWon")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {stages.map((item) => {
          const active = item.id === deal.stage_id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => void moveStage(item)}
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                active ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {item.name}
              {active ? ` ${t("days", { count: daysSince(deal.updated_at || deal.created_at) })}` : ""}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          <section className="space-y-3 rounded-xl bg-muted/40 p-4 text-sm">
            <h2 className="font-semibold">{t("sectionDeal")}</h2>
            <Field label={t("name")}>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => {
                  if (title.trim() && title.trim() !== deal.title) void save({ title: title.trim() });
                }}
                className="h-8 bg-background"
              />
            </Field>
            <Field label={t("qualification")}>
              <span>{t(warmKey(stage?.position ?? 0))}</span>
            </Field>
            <Field label={t("closeForecast")}>
              <Input
                type="date"
                value={closeDate}
                onChange={(event) => setCloseDate(event.target.value)}
                onBlur={() => void save({ expected_close_date: closeDate || null })}
                className="h-8 bg-background"
              />
            </Field>
            <Field label={t("createdAt")}>
              <span>
                {new Date(deal.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Field>
            <Field label={t("totalValue")}>
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => void save({ value: Number(value) || 0 })}
                className="h-8 bg-background"
              />
            </Field>
          </section>

          <section className="space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
            <h2 className="font-semibold">{t("contacts")}</h2>
            {contact ? (
              <Link href={`/contacts/${contact.id}`} className="block rounded-lg px-1 py-1 hover:bg-background">
                <p className="font-medium">{contact.name || contact.company || t("noContact")}</p>
                <p className="text-xs text-muted-foreground">{contact.phone}</p>
                {contact.email ? <p className="text-xs text-muted-foreground">{contact.email}</p> : null}
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">{t("noContact")}</p>
            )}
            <Button variant="ghost" size="sm" className="text-sky-700" onClick={() => setContactOpen(true)}>
              <Plus className="size-3.5" />
              {t("addContact")}
            </Button>
          </section>

          <section className="space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
            <h2 className="font-semibold">{t("company")}</h2>
            <Info label={t("name")} value={contact?.company || t("none")} />
            <Info label={t("segment")} value={contact?.company_segment || t("none")} />
            <Info label={t("url")} value={contact?.company_url || t("none")} />
            <Info label={t("address")} value={contact?.company_address || t("none")} />
            {contact?.company ? (
              <Link href={`/empresas/${contact.id}`} className="text-xs font-medium text-sky-700">
                {t("openCompany")}
              </Link>
            ) : null}
          </section>

          <section className="space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
            <h2 className="font-semibold">{t("ownerSection")}</h2>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
              <span className="text-muted-foreground">{t("owner")}</span>
              <Select
                value={ownerId || "none"}
                onValueChange={(next) => {
                  const id = !next || next === "none" ? "" : next;
                  setOwnerId(id);
                  void save({ assigned_to: id || null });
                }}
              >
                <SelectTrigger className="h-8 w-full bg-background">
                  <SelectValue>{ownerName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("none")}</SelectItem>
                  {profiles.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.full_name || person.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t("upcomingTasks")}</h2>
              <Button size="sm" variant="outline" onClick={() => setTaskOpen(true)}>
                <Plus className="size-3.5" />
                {t("createTask")}
              </Button>
            </div>
            {openTasks[0] ? (
              <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm">
                <p className="font-medium">{openTasks[0].title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(openTasks[0].due_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                {t("noTasks")}
              </p>
            )}
          </section>

          {tipOpen && dealDisplayStatus(deal) === "open" ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-violet-300 bg-violet-50 px-4 py-3 text-slate-900">
              <div>
                <p className="font-semibold">{t("tipTitle")}</p>
                <p className="text-sm">{t("tipBody")}</p>
              </div>
              <button type="button" onClick={() => setTipOpen(false)} aria-label={t("back")}>
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          <div className="flex gap-4 border-b border-border">
            <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")}>
              {t("tabTasks")}
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              {t("tabHistory")}
            </TabButton>
            <TabButton active={tab === "products"} onClick={() => setTab("products")}>
              {t("tabProducts")}
            </TabButton>
          </div>

          {tab === "products" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("productsHint")}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {DEAL_PRODUCTS.map((name) => {
                  const selected = Array.isArray(deal.products) && deal.products.includes(name);
                  return (
                    <li key={name}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => void toggleProduct(name)}
                          className="size-4 accent-sky-600"
                        />
                        <span className={selected ? "font-medium" : ""}>{name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : tab === "history" ? (
            <ol className="space-y-3 border-l border-border pl-4">
              {history.length === 0 ? (
                <li className="text-sm text-muted-foreground">{t("noHistory")}</li>
              ) : (
                history.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-sky-500" />
                    <p className="text-sm">{event.message}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(event.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                ))
              )}
            </ol>
          ) : (
            <ul className="space-y-2">
              {tasks.length === 0 ? (
                <li className="text-sm text-muted-foreground">{t("noTasks")}</li>
              ) : (
                [...tasks].sort((a, b) => Number(Boolean(a.done_at)) - Number(Boolean(b.done_at))).map((task) => (
                  <li key={task.id} className="rounded-lg border border-border px-3 py-2 text-sm">
                    <p className={task.done_at ? "text-muted-foreground line-through" : "font-medium"}>{task.title}</p>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <DealTaskForm
        open={taskOpen}
        onOpenChange={setTaskOpen}
        deal={deal}
        deals={[deal]}
        profiles={profiles}
        onSaved={() => void load()}
      />
      <ContactForm
        open={contactOpen}
        onOpenChange={setContactOpen}
        defaultCompany={contact?.company || ""}
        onSaved={() => void load()}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
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
