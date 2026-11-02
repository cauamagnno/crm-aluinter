"use client";

import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { periodInputValues, type DashboardPeriod } from "@/lib/dashboard/period";
import type { TaskActivity } from "@/lib/dashboard/task-activity";
import { SkeletonCard } from "@/components/dashboard/skeleton";

export function TaskActivityBar({
  activity,
  loading,
  period,
}: {
  activity: TaskActivity | null;
  loading: boolean;
  period: DashboardPeriod;
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
    { key: "ligacao" as const, label: t("call"), value: activity.ligacao, icon: Phone },
    { key: "whatsapp" as const, label: t("whatsapp"), value: activity.whatsapp, icon: MessageCircle },
    { key: "email" as const, label: t("email"), value: activity.email, icon: Mail },
  ];

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("source")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          const href = `/tarefas?status=done&kind=${item.key}&from=${from}&to=${to}&scope=visible`;
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
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
