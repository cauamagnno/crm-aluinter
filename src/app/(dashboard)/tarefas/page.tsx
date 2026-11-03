"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { localDayKey } from "@/lib/dashboard/date-utils";
import { DealTaskForm } from "@/components/pipelines/deal-task-form";
import { Button } from "@/components/ui/button";
import type { Deal, DealTask, Profile } from "@/types";

type TaskRow = DealTask & {
  deal?: Pick<Deal, "id" | "title" | "value" | "currency" | "contact_id"> | null;
};

const KINDS = ["ligacao", "whatsapp", "email"] as const;

export default function TarefasPage() {
  return (
    <Suspense fallback={null}>
      <TarefasPageInner />
    </Suspense>
  );
}

function TarefasPageInner() {
  const t = useTranslations("Tasks");
  const searchParams = useSearchParams();
  const scopeVisible = searchParams.get("scope") === "visible";
  const { profile, accountRole, defaultCurrency } = useAuth();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"pending" | "done">("pending");
  const [kind, setKind] = useState<string>("all");
  const [sellerId, setSellerId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const queryKey = searchParams.toString();

  useEffect(() => {
    if (!queryKey) return;
    const statusParam = searchParams.get("status");
    const kindParam = searchParams.get("kind") ?? "all";
    setStatus(statusParam === "done" ? "done" : "pending");
    setKind(KINDS.includes(kindParam as (typeof KINDS)[number]) ? kindParam : "all");
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
  }, [queryKey, searchParams]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const supabase = createClient();
    let taskQuery = supabase
      .from("deal_tasks")
      .select("*, deal:deals(id, title, value, currency, contact_id)")
      .order("due_at");
    if (!scopeVisible) taskQuery = taskQuery.eq("assignee_id", profile.id);
    const [taskRes, dealRes, profileRes] = await Promise.all([
      taskQuery,
      supabase.from("deals").select("id, title, value, currency, contact_id, pipeline_id, stage_id, status"),
      supabase.from("profiles").select("*").order("full_name"),
    ]);
    if (taskRes.error) {
      console.error(taskRes.error);
      toast.error(t("loadError"));
    } else {
      setTasks((taskRes.data ?? []) as TaskRow[]);
    }
    setDeals((dealRes.data ?? []) as Deal[]);
    setProfiles((profileRes.data ?? []) as Profile[]);
    setLoading(false);
  }, [profile?.id, scopeVisible, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      const done = Boolean(task.done_at);
      if (status === "pending" && done) return false;
      if (status === "done" && !done) return false;
      if (kind !== "all" && task.kind !== kind) return false;
      if (sellerId !== "all" && task.assignee_id !== sellerId) return false;
      const anchor = status === "done" ? task.done_at : task.due_at;
      if (!anchor) return false;
      const day = localDayKey(anchor);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [tasks, status, kind, sellerId, from, to]);

  async function markDone(task: TaskRow) {
    const supabase = createClient();
    const { error } = await supabase
      .from("deal_tasks")
      .update({ done_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) {
      toast.error(t("completeFailed"));
      return;
    }
    toast.success(t("completed"));
    void load();
  }

  function kindLabel(value: string) {
    if (value === "ligacao") return t("kindCall");
    if (value === "whatsapp") return t("kindWhatsapp");
    if (value === "email") return t("kindEmail");
    return t("kindTask");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scopeVisible ? t("hintVisible") : t("hint")}
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} disabled={!profile?.id}>
          <Plus className="h-4 w-4" />
          {t("create")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "pending" | "done")}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
        >
          <option value="pending">{t("pending")}</option>
          <option value="done">{t("done")}</option>
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
        >
          <option value="all">{t("allKinds")}</option>
          {KINDS.map((item) => (
            <option key={item} value={item}>
              {kindLabel(item)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("seller")}
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
        >
          <option value="all">{t("allSellers")}</option>
          {profiles.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name || person.email || t("noSeller")}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
          aria-label={t("from")}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
          aria-label={t("to")}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {scopeVisible ? t("emptyVisible") : t("empty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("colTask")}</th>
                <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
                <th className="px-3 py-2 font-medium">{t("colWhen")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("colDeal")}</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">{t("colSeller")}</th>
                <th className="hidden px-3 py-2 font-medium lg:table-cell">{t("colValue")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => {
                const late = !task.done_at && new Date(task.due_at).getTime() < Date.now();
                const seller = profiles.find((person) => person.id === task.assignee_id);
                return (
                  <tr key={task.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{kindLabel(task.kind)}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {task.done_at ? t("statusDone") : late ? t("statusLate") : t("statusOpen")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(status === "done" && task.done_at ? task.done_at : task.due_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">{task.deal?.title ?? "—"}</td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {seller?.full_name || seller?.email || t("noSeller")}
                    </td>
                    <td className="hidden px-3 py-2 lg:table-cell">
                      {task.deal
                        ? formatCurrency(Number(task.deal.value ?? 0), task.deal.currency ?? defaultCurrency)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!task.done_at && (
                        <Button size="sm" variant="outline" onClick={() => void markDone(task)}>
                          <Check className="h-3.5 w-3.5" />
                          {t("complete")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DealTaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        deal={null}
        deals={deals}
        profiles={profiles}
        lockAssignee={accountRole === "agent"}
        onSaved={() => void load()}
      />
    </div>
  );
}
