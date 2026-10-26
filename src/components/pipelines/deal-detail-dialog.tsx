"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  X,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/currency";
import { dealDisplayStatus } from "@/lib/pipelines/status";
import type { Deal, DealStatus, DealTask, PipelineStage, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DealDetailDialog({
  open,
  onOpenChange,
  deal,
  stages,
  profiles,
  onSaved,
  onCreateTask,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  stages: PipelineStage[];
  profiles: Profile[];
  onSaved: () => void;
  onCreateTask: (deal: Deal) => void;
}) {
  const t = useTranslations("Pipelines.form");
  const tTasks = useTranslations("Pipelines.tasks");
  const tStatus = useTranslations("Pipelines.status");
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DealTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    if (!open || !deal) return;
    setTitle(deal.title);
    setValue(String(deal.value ?? ""));
    setStageId(deal.stage_id);
    setAssignedTo(deal.assigned_to ?? "");
    setExpectedCloseDate((deal.expected_close_date ?? "").slice(0, 10));
    setNotes(deal.notes ?? "");
  }, [open, deal]);

  useEffect(() => {
    if (!open || !deal) return;
    let cancelled = false;
    (async () => {
      setTasksLoading(true);
      const { data } = await supabase
        .from("deal_tasks")
        .select("*")
        .eq("deal_id", deal.id)
        .order("due_at", { ascending: true });
      if (cancelled) return;
      setTasks((data as DealTask[]) ?? []);
      setTasksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, deal?.id, supabase]);

  if (!deal) return null;
  const current = deal;

  const display = dealDisplayStatus(current);
  const contactLabel = current.contact?.name || current.contact?.phone || "—";

  async function handleSave() {
    if (!title.trim() || !stageId) {
      toast.error(t("toastRequired"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("deals")
      .update({
        title: title.trim(),
        value: parseFloat(value) || 0,
        stage_id: stageId,
        assigned_to: assignedTo || null,
        expected_close_date: expectedCloseDate || null,
        notes: notes.trim() || null,
      })
      .eq("id", current.id);
    setSaving(false);
    if (error) {
      toast.error(t("toastFailedSave"));
      return;
    }
    toast.success(t("toastUpdated"));
    onSaved();
  }

  async function handleStatusChange(status: DealStatus) {
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update({ status, paused: false })
      .eq("id", current.id);
    setStatusAction(null);
    if (error) {
      toast.error(t("toastFailedStatus"));
      return;
    }
    toast.success(
      status === "won"
        ? t("toastMarkedWon")
        : status === "lost"
          ? t("toastMarkedLost")
          : t("toastReopened"),
    );
    onSaved();
  }

  async function handlePause(next: boolean) {
    setStatusAction(next ? "pause" : "unpause");
    const { error } = await supabase
      .from("deals")
      .update({ paused: next, status: "open" })
      .eq("id", current.id);
    setStatusAction(null);
    if (error) {
      toast.error(t("toastFailedStatus"));
      return;
    }
    toast.success(next ? t("toastPaused") : t("toastUnpaused"));
    onSaved();
  }

  async function completeTask(task: DealTask) {
    const { error } = await supabase
      .from("deal_tasks")
      .update({ done_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) {
      toast.error(tTasks("completeFailed"));
      return;
    }
    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? { ...item, done_at: new Date().toISOString() } : item,
      ),
    );
    toast.success(tTasks("completed"));
    onSaved();
  }

  const openTasks = tasks.filter((task) => !task.done_at);
  const doneTasks = tasks.filter((task) => task.done_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-popover sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{deal.title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{contactLabel}</p>
          <p className="text-xs text-muted-foreground">
            {t("createdAt")}{" "}
            {new Date(deal.created_at).toLocaleDateString("pt-BR")}
            {" · "}
            {tStatus(display === "paused" ? "paused" : display === "lost" ? "lost" : display === "won" ? "won" : "open")}
          </p>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>{t("title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="bg-muted" />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("value")}</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                R$
              </span>
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="bg-muted pl-9"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("expectedCloseDate")}</Label>
            <Input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="bg-muted"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("stage")}</Label>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("assignedTo")}</Label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm"
            >
              <option value="">{t("unassigned")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>{t("notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-20 bg-muted"
            />
          </div>
        </div>

        {deal.conversation_id ? (
          <Link
            href="/inbox"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("linkToConversation")}
          </Link>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => handleStatusChange("won")}
            disabled={!!statusAction || deal.status === "won"}
          >
            {statusAction === "won" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t("markAsWon")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleStatusChange("lost")}
            disabled={!!statusAction || deal.status === "lost"}
          >
            {statusAction === "lost" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            {t("markAsLost")}
          </Button>
          {deal.paused ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePause(false)}
              disabled={!!statusAction}
            >
              <Play className="size-4" />
              {t("unpauseDeal")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handlePause(true)}
              disabled={!!statusAction || deal.status !== "open"}
            >
              <Pause className="size-4" />
              {t("pauseDeal")}
            </Button>
          )}
          {deal.status && deal.status !== "open" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleStatusChange("open")}
              disabled={!!statusAction}
            >
              {t("reopenDeal")}
            </Button>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("tasks")}</h3>
            <Button size="sm" variant="outline" onClick={() => onCreateTask(deal)}>
              <Plus className="size-3.5" />
              {tTasks("title")}
            </Button>
          </div>
          {tasksLoading ? (
            <p className="text-xs text-muted-foreground">{tTasks("loading")}</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{tTasks("empty")}</p>
          ) : (
            <ul className="space-y-2">
              {openTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(task.due_at)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => completeTask(task)}>
                    {tTasks("markComplete")}
                  </Button>
                </li>
              ))}
              {doneTasks.map((task) => (
                <li
                  key={task.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground line-through"
                >
                  {task.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("saving") : t("saveChanges")}
          </Button>
        </div>
        <p className="sr-only">{formatCurrency(Number(value) || 0, deal.currency)}</p>
      </DialogContent>
    </Dialog>
  );
}
