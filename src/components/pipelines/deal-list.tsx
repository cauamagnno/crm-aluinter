"use client";

import type { Deal, PipelineStage, Profile } from "@/types";
import { formatCurrency } from "@/lib/currency";
import { formatDateTimePt } from "@/lib/pt-format";
import { dealDisplayStatus } from "@/lib/pipelines/status";
import { profileLabel } from "@/lib/pipelines/task-kinds";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface DealListProps {
  deals: Deal[];
  stages: PipelineStage[];
  profiles: Profile[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpen: (deal: Deal) => void;
}

function ownerName(deal: Deal, profiles: Profile[]) {
  const fromDeal = profileLabel(deal.assignee);
  if (fromDeal) return fromDeal;
  const profile = profiles.find((person) => person.id === deal.assigned_to);
  return profileLabel(profile) || "—";
}

function companyName(deal: Deal) {
  return deal.contact?.company?.trim() || deal.contact?.name?.trim() || "—";
}

function formatWhen(iso: string) {
  return formatDateTimePt(iso);
}

const STATUS_CLASS = {
  won: "bg-emerald-500/15 text-emerald-600",
  lost: "bg-red-500/15 text-red-500",
  paused: "bg-amber-500/15 text-amber-600",
  open: "bg-sky-500/15 text-sky-600",
} as const;

export function DealList({
  deals,
  stages,
  profiles,
  loading,
  hasMore,
  onLoadMore,
  onOpen,
}: DealListProps) {
  const t = useTranslations("Pipelines.list");
  const tStatus = useTranslations("Pipelines.status");
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  if (loading && deals.length === 0) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
    );
  }

  if (deals.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t("colNextTask")}</th>
              <th className="px-3 py-2 font-medium">{t("colDeal")}</th>
              <th className="px-3 py-2 font-medium">{t("colCompany")}</th>
              <th className="px-3 py-2 font-medium">{t("colStage")}</th>
              <th className="px-3 py-2 font-medium">{t("colStatus")}</th>
              <th className="px-3 py-2 font-medium">{t("colOwner")}</th>
              <th className="px-3 py-2 font-medium">{t("colValue")}</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const display = dealDisplayStatus(deal);
              const stage = stageById.get(deal.stage_id);
              const nextTask = deal.next_task;
              return (
                <tr
                  key={deal.id}
                  className="cursor-pointer border-t border-border hover:bg-muted/40"
                  onClick={() => onOpen(deal)}
                >
                  <td className="px-3 py-2 text-foreground">
                    {nextTask ? (
                      <span className="block max-w-[220px] truncate">
                        {nextTask.title}
                        {nextTask.due_at ? ` · ${formatWhen(nextTask.due_at)}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{deal.title}</td>
                  <td className="px-3 py-2 text-muted-foreground">{companyName(deal)}</td>
                  <td className="px-3 py-2 text-foreground">{stage?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[display]}`}
                    >
                      {tStatus(display)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{ownerName(deal, profiles)}</td>
                  <td className="px-3 py-2 text-foreground">
                    {formatCurrency(deal.value, deal.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
