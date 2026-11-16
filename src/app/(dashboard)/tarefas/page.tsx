"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { hasMinRole } from "@/lib/auth/roles";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { fromDateInputValue, startOfNextLocalDay } from "@/lib/dashboard/date-utils";
import { formatDateTimePt } from "@/lib/pt-format";
import { SellerPicker } from "@/components/dashboard/seller-picker";
import { DealTaskForm } from "@/components/pipelines/deal-task-form";
import { BrDateInput } from "@/components/ui/br-date-input";
import { Button } from "@/components/ui/button";
import { FieldSelect } from "@/components/ui/field-select";
import type { Deal, DealTask, Profile } from "@/types";

type TaskRow = DealTask & {
  deal?: Pick<Deal, "id" | "title" | "value" | "currency" | "contact_id" | "assigned_to"> | null;
};

const KINDS = ["ligacao", "whatsapp", "email", "visita"] as const;
const PAGE_SIZE = 40;

export default function TarefasPage() {
  return (
    <Suspense fallback={null}>
      <TarefasPageInner />
    </Suspense>
  );
}

function TarefasPageInner() {
  const t = useTranslations("Tasks");
  const tTasksForm = useTranslations("Pipelines.tasks");
  const searchParams = useSearchParams();
  const scopeVisible = searchParams.get("scope") === "visible";
  const { profile, accountRole, defaultCurrency } = useAuth();
  const seesAllDeals = accountRole ? hasMinRole(accountRole, "gestor") : false;
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"pending" | "done" | "cancelled">("pending");
  const [kind, setKind] = useState<string>("all");
  const [sellerId, setSellerId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [correcting, setCorrecting] = useState<TaskRow | null>(null);

  const queryKey = searchParams.toString();

  useEffect(() => {
    if (!queryKey) return;
    const statusParam = searchParams.get("status");
    const kindParam = searchParams.get("kind") ?? "all";
    setStatus(
      statusParam === "done" ? "done" : statusParam === "cancelled" ? "cancelled" : "pending",
    );
    setKind(KINDS.includes(kindParam as (typeof KINDS)[number]) ? kindParam : "all");
    setFrom(searchParams.get("from") ?? "");
    setTo(searchParams.get("to") ?? "");
    setSellerId(searchParams.get("seller") ?? "all");
    setPage(0);
  }, [queryKey, searchParams]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const supabase = createClient();
    const column = status === "done" ? "done_at" : status === "cancelled" ? "cancelled_at" : "due_at";
    let taskQuery = supabase
      .from("deal_tasks")
      .select("*, deal:deals(id, title, value, currency, contact_id, assigned_to)", {
        count: "exact",
      });
    if (!scopeVisible) taskQuery = taskQuery.eq("assignee_id", profile.id);
    if (status === "pending") {
      taskQuery = taskQuery.is("done_at", null).is("cancelled_at", null);
    } else if (status === "done") {
      taskQuery = taskQuery.not("done_at", "is", null).is("cancelled_at", null);
    } else {
      taskQuery = taskQuery.not("cancelled_at", "is", null);
    }
    if (kind !== "all") taskQuery = taskQuery.eq("kind", kind);
    if (sellerId !== "all") taskQuery = taskQuery.eq("assignee_id", sellerId);
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      taskQuery = taskQuery.gte(column, fromDateInputValue(from).toISOString());
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      taskQuery = taskQuery.lt(column, startOfNextLocalDay(fromDateInputValue(to)).toISOString());
    }
    const [taskRes, profileRes] = await Promise.all([
      taskQuery
        .order(column, { ascending: status === "pending" })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
      supabase.from("profiles").select("id, full_name, email, account_role").order("full_name"),
    ]);
    if (taskRes.error) {
      console.error(taskRes.error);
      toast.error(t("loadError"));
    } else {
      setTasks((taskRes.data ?? []) as TaskRow[]);
      setTotal(taskRes.count ?? (taskRes.data ?? []).length);
    }
    setProfiles((profileRes.data ?? []) as Profile[]);
    setLoading(false);
  }, [profile?.id, scopeVisible, status, kind, sellerId, from, to, page, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formOpen && !correcting) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase
      .from("deals")
      .select("id, title, value, currency, contact_id, pipeline_id, stage_id, status, assigned_to")
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) setDeals((data ?? []) as Deal[]);
      });
    return () => {
      cancelled = true;
    };
  }, [formOpen, correcting]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  async function cancelTask(task: TaskRow) {
    const supabase = createClient();
    const { error } = await supabase
      .from("deal_tasks")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) {
      toast.error(t("cancelFailed"));
      return;
    }
    toast.success(t("taskCancelled"));
    void load();
  }

  // Assignee, the deal's seller, gestor and above can correct a task.
  function canCorrect(task: TaskRow) {
    return (
      seesAllDeals ||
      task.assignee_id === profile?.id ||
      task.deal?.assigned_to === profile?.id
    );
  }

  function kindLabel(value: string) {
    if (value === "ligacao") return t("kindCall");
    if (value === "whatsapp") return t("kindWhatsapp");
    if (value === "email") return t("kindEmail");
    if (value === "visita") return t("kindVisit");
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
        <FieldSelect
          aria-label={t("colStatus")}
          value={status}
          onValueChange={(next) => {
            setStatus(next as "pending" | "done" | "cancelled");
            setPage(0);
          }}
          className="w-auto"
          options={[
            { value: "pending", label: t("pending") },
            { value: "done", label: t("done") },
            { value: "cancelled", label: t("cancelled") },
          ]}
        />
        <FieldSelect
          aria-label={t("allKinds")}
          value={kind}
          onValueChange={(next) => {
            setKind(next);
            setPage(0);
          }}
          className="w-auto"
          options={[
            { value: "all", label: t("allKinds") },
            ...KINDS.map((item) => ({ value: item, label: kindLabel(item) })),
          ]}
        />
        <SellerPicker
          sellerId={sellerId}
          sellers={profiles.map((person) => ({
            id: person.id,
            name: person.full_name || person.email || t("noSeller"),
          }))}
          onChange={(next) => {
            setSellerId(next);
            setPage(0);
          }}
        />
        <BrDateInput
          aria-label={t("from")}
          value={from}
          onValueChange={(next) => {
            setFrom(next);
            setPage(0);
          }}
          className="h-9 w-[8.5rem] bg-card"
        />
        <BrDateInput
          aria-label={t("to")}
          value={to}
          onValueChange={(next) => {
            setTo(next);
            setPage(0);
          }}
          className="h-9 w-[8.5rem] bg-card"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
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
              {tasks.map((task) => {
                const late = !task.done_at && !task.cancelled_at && new Date(task.due_at).getTime() < Date.now();
                const seller = profiles.find((person) => person.id === task.assignee_id);
                return (
                  <tr key={task.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{task.title}</p>
                      {task.description ? (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{kindLabel(task.kind)}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {task.cancelled_at
                        ? t("statusCancelled")
                        : task.done_at
                          ? t("statusDone")
                          : late
                            ? t("statusLate")
                            : t("statusOpen")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatDateTimePt(
                        status === "done" && task.done_at
                          ? task.done_at
                          : status === "cancelled" && task.cancelled_at
                            ? task.cancelled_at
                            : task.due_at,
                      )}
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
                      {!task.done_at && !task.cancelled_at && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => void cancelTask(task)}>
                            {t("cancelTask")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => void markDone(task)}>
                            <Check className="h-3.5 w-3.5" />
                            {t("complete")}
                          </Button>
                        </div>
                      )}
                      {task.done_at && !task.cancelled_at && canCorrect(task) && (
                        <Button size="sm" variant="outline" onClick={() => setCorrecting(task)}>
                          {tTasksForm("correctButton")}
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {t("pageRange", {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, total),
              total,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              {t("previousPage")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pageCount || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              {t("nextPage")}
            </Button>
          </div>
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
      <DealTaskForm
        open={correcting !== null}
        onOpenChange={(next) => {
          if (!next) setCorrecting(null);
        }}
        deal={null}
        deals={deals}
        profiles={profiles}
        correctTask={correcting}
        onSaved={() => void load()}
      />
    </div>
  );
}
