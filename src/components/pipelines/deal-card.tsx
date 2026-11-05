"use client";

import type { Deal, PipelineStage } from "@/types";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { formatDateTimePt } from "@/lib/pt-format";
import { dealDisplayStatus } from "@/lib/pipelines/status";
import { profileLabel, taskKindMessageKey } from "@/lib/pipelines/task-kinds";
import { useTranslations } from "next-intl";

interface DealCardProps {
  deal: Deal;
  stage: PipelineStage | null;
  onEdit: (deal: Deal) => void;
  onCreateTask?: (deal: Deal) => void;
  isOverlay?: boolean;
}

function formatTaskChip(iso: string) {
  return formatDateTimePt(iso);
}

export function DealCard({
  deal,
  stage,
  onEdit,
  onCreateTask,
  isOverlay,
}: DealCardProps) {
  const t = useTranslations("Pipelines.card");
  const tStatus = useTranslations("Pipelines.status");
  const tTasks = useTranslations("Pipelines.tasks");
  const companyLabel = deal.contact?.company?.trim() || "—";
  const display = dealDisplayStatus(deal);
  const nextTask = deal.next_task;

  const badge =
    display === "won"
      ? { label: t("won"), className: "bg-emerald-500/15 text-emerald-600" }
      : display === "lost"
        ? { label: t("lost"), className: "bg-red-500/15 text-red-500" }
        : display === "paused"
          ? { label: t("paused"), className: "bg-amber-500/15 text-amber-600" }
          : { label: t("open"), className: "bg-sky-500/15 text-sky-600" };

  const dot =
    display === "lost"
      ? "bg-red-500"
      : display === "won"
        ? "bg-emerald-500"
        : display === "paused"
          ? "bg-amber-500"
          : "bg-sky-500";

  return (
    <div
      className={`group relative w-full rounded-lg border border-border bg-card text-left shadow-sm transition-all ${
        isOverlay ? "shadow-xl" : "hover:border-border hover:shadow-md"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          if (isOverlay) return;
          e.stopPropagation();
          onEdit(deal);
        }}
        className="w-full cursor-pointer px-3 pt-3 pb-2 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
            <span className={`size-1.5 rounded-full ${dot}`} />
            <span className={`rounded px-1.5 py-0.5 ${badge.className}`}>
              {badge.label}
            </span>
          </span>
        </div>

        <h4 className="mt-2 text-sm font-semibold uppercase leading-snug text-foreground break-words">
          {deal.title}
        </h4>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {companyLabel}
        </p>
        <p className="mt-1 text-xs font-medium text-foreground">
          {formatCurrency(deal.value, deal.currency)}
        </p>
        {display === "lost" && deal.lost_reason ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{deal.lost_reason}</p>
        ) : null}
        {stage ? <span className="sr-only">{stage.name}</span> : null}
        {display === "open" ? (
          <span className="sr-only">{tStatus("open")}</span>
        ) : null}
      </button>

      <div className="border-t border-border/70 px-2 py-1.5">
        {nextTask ? (
          <div className="rounded-md bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-600">
            <p className="truncate">
              {nextTask.title.toUpperCase()} {formatTaskChip(nextTask.due_at)}
            </p>
            <p className="truncate font-normal">
              {tTasks(taskKindMessageKey(nextTask.kind))}
              {profileLabel(nextTask.assignee)
                ? ` · ${profileLabel(nextTask.assignee)}`
                : ""}
            </p>
          </div>
        ) : onCreateTask && !isOverlay ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateTask(deal);
            }}
            className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t("createTask")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
