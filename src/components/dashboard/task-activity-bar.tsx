"use client";

import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { periodInputValues, type DashboardPeriod } from "@/lib/dashboard/period";
import type { TaskActivity } from "@/lib/dashboard/task-activity";
import {
  DEFAULT_DASHBOARD_GOALS,
  type DashboardGoals,
} from "@/lib/dashboard/goals";
import { SkeletonCard } from "@/components/dashboard/skeleton";

export function TaskActivityBar({
  activity,
  loading,
  period,
  goals = DEFAULT_DASHBOARD_GOALS,
  sellerCount = 1,
  sellerId,
}: {
  activity: TaskActivity | null;
  loading: boolean;
  period: DashboardPeriod;
  /** Already scoped: one seller's goals, or the team total. */
  goals?: DashboardGoals;
  /** Sellers behind the target. More than one means a team total. */
  sellerCount?: number;
  /** Profile id when the view is a single seller. */
  sellerId?: string;
}) {
  const t = useTranslations("Dashboard.tasks");
  const { from, to } = periodInputValues(period);

  if (loading && !activity) {
    return <SkeletonCard className="min-h-[120px]" />;
  }

  if (!activity) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {t("loadError")}
      </section>
    );
  }

  const items = [
    { key: "ligacao" as const, label: t("call"), value: activity.ligacao, icon: Phone, target: goals.callsPerDay },
    { key: "whatsapp" as const, label: t("whatsapp"), value: activity.whatsapp, icon: MessageCircle, target: goals.whatsappPerDay },
    { key: "email" as const, label: t("email"), value: activity.email, icon: Mail, target: goals.emailsPerDay },
    { key: "visita" as const, label: t("visit"), value: activity.visita, icon: MapPin, target: 0 },
  ];

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("source")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const seller = sellerId ? `&seller=${sellerId}` : "";
          const href = `/tarefas?status=done&kind=${item.key}&from=${from}&to=${to}&scope=visible${seller}`;
          return (
            <Link
              key={item.key}
              href={href}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-3 transition-colors hover:bg-muted/60"
            >
              <div>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {item.value.toLocaleString("pt-BR")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.target === 0
                    ? t("noTarget")
                    : sellerCount > 1
                      ? t("teamTarget", { target: item.target, sellers: sellerCount })
                      : t("dailyTarget", { target: item.target })}
                </p>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
