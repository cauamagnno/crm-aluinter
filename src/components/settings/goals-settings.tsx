"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_DASHBOARD_GOALS,
  goalsToRow,
  parseDashboardGoals,
  type DashboardGoals,
} from "@/lib/dashboard/goals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

function GoalField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
  step,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step ?? "1"}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-muted"
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function GoalsSettings() {
  const t = useTranslations("Settings.goals");
  const { accountId, accountRole } = useAuth();
  const canEdit = accountRole === "owner" || accountRole === "admin" || accountRole === "gestor";
  const [goals, setGoals] = useState<DashboardGoals>(DEFAULT_DASHBOARD_GOALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const db = createClient();
    void db
      .from("account_dashboard_goals")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setGoals(parseDashboardGoals(data));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  function patch<K extends keyof DashboardGoals>(key: K, value: DashboardGoals[K]) {
    setGoals((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    if (!accountId || !canEdit) return;
    setSaving(true);
    const db = createClient();
    const next = parseDashboardGoals(goalsToRow(accountId, goals));
    const { error } = await db
      .from("account_dashboard_goals")
      .upsert(goalsToRow(accountId, next), { onConflict: "account_id" });
    setSaving(false);
    if (error) {
      toast.error(t("saveFailed"));
      return;
    }
    setGoals(next);
    toast.success(t("saveSuccess"));
  }

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Target className="size-4 text-primary" />
              {t("dailyTitle")}
            </CardTitle>
            <CardDescription>{t("dailyHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <GoalField
              id="conversations"
              label={t("conversationsPerDay")}
              value={goals.conversationsPerDay}
              onChange={(value) => patch("conversationsPerDay", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="calls"
              label={t("callsPerDay")}
              value={goals.callsPerDay}
              onChange={(value) => patch("callsPerDay", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="whatsapp"
              label={t("whatsappPerDay")}
              value={goals.whatsappPerDay}
              onChange={(value) => patch("whatsappPerDay", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="emails"
              label={t("emailsPerDay")}
              value={goals.emailsPerDay}
              onChange={(value) => patch("emailsPerDay", value)}
              disabled={!canEdit || loading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">{t("otherTitle")}</CardTitle>
            <CardDescription>{t("otherHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <GoalField
              id="quotes"
              label={t("quotesPerWeek")}
              value={goals.quotesPerWeek}
              onChange={(value) => patch("quotesPerWeek", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="new"
              label={t("newReactivatedPerMonth")}
              value={goals.newReactivatedPerMonth}
              onChange={(value) => patch("newReactivatedPerMonth", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="curve"
              label={t("curveAPct")}
              value={goals.curveAPct}
              onChange={(value) => patch("curveAPct", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="follow"
              label={t("followUpPct")}
              value={goals.followUpPct}
              onChange={(value) => patch("followUpPct", value)}
              disabled={!canEdit || loading}
            />
            <GoalField
              id="revenue"
              label={t("revenuePerMonth")}
              hint={t("revenueHint")}
              value={goals.revenuePerMonth}
              onChange={(value) => patch("revenuePerMonth", value)}
              disabled={!canEdit || loading}
              step="1000"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!canEdit || loading || saving}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
        {!canEdit ? (
          <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
        ) : null}
      </div>
    </section>
  );
}
