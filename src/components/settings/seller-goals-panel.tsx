"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatBrMoney } from "@/lib/pt-format";
import { BrMoneyInput } from "@/components/ui/br-money-input";
import type { DashboardGoals } from "@/lib/dashboard/goals";
import {
  EMPTY_SELLER_GOAL,
  SELLER_GOAL_FIELDS,
  effectiveSellerGoals,
  parseSellerGoalRows,
  type SellerGoalField,
  type SellerGoalOverride,
} from "@/lib/dashboard/seller-goals";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type RowState = "idle" | "saving" | "saved";

const INTEGER_FIELDS: SellerGoalField[] = ["callsPerDay", "whatsappPerDay", "emailsPerDay"];

function toDraft(value: number | null) {
  return value === null ? "" : String(value);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * One row per person, one box per goal. Leave a box empty to follow the
 * account default (shown as the placeholder), type 0 for "no goal". Every
 * change saves on its own: after a short pause in typing, on Enter, or when
 * the box loses focus.
 */
export function SellerGoalsPanel({ defaults }: { defaults: DashboardGoals }) {
  const t = useTranslations("Settings.goals.sellers");
  const { accountId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [saved, setSaved] = useState<Map<string, SellerGoalOverride>>(() => new Map());
  const [drafts, setDrafts] = useState<Record<string, Record<SellerGoalField, string>>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latest saved values, so a save never works from a stale render.
  const savedRef = useRef<Map<string, SellerGoalOverride>>(new Map());

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const db = createClient();
    void Promise.all([
      db.from("profiles").select("id, full_name, email").eq("account_id", accountId).order("full_name"),
      db.from("seller_goals").select("*").eq("account_id", accountId),
    ]).then(([people, goals]) => {
      if (cancelled) return;
      const rows = (people.data ?? []) as Member[];
      const overrides = parseSellerGoalRows(goals.data);
      setMembers(rows);
      savedRef.current = overrides;
      setSaved(overrides);
      setDrafts(
        Object.fromEntries(
          rows.map((member) => {
            const o = overrides.get(member.id) ?? EMPTY_SELLER_GOAL;
            return [
              member.id,
              {
                callsPerDay: toDraft(o.callsPerDay),
                whatsappPerDay: toDraft(o.whatsappPerDay),
                emailsPerDay: toDraft(o.emailsPerDay),
                revenuePerMonth: toDraft(o.revenuePerMonth),
              },
            ];
          }),
        ),
      );
      setLoading(false);
    });
    const pending = timers.current;
    return () => {
      cancelled = true;
      Object.values(pending).forEach(clearTimeout);
    };
  }, [accountId]);

  const flash = useCallback((profileId: string) => {
    setRowState((s) => ({ ...s, [profileId]: "saved" }));
    clearTimeout(timers.current[profileId]);
    timers.current[profileId] = setTimeout(() => {
      setRowState((s) => ({ ...s, [profileId]: "idle" }));
    }, 1600);
  }, []);

  const persist = useCallback(
    async (profileId: string, next: SellerGoalOverride) => {
      if (!accountId) return false;
      setRowState((s) => ({ ...s, [profileId]: "saving" }));
      const db = createClient();
      const empty = SELLER_GOAL_FIELDS.every((field) => next[field] === null);
      const { error } = empty
        ? await db
            .from("seller_goals")
            .delete()
            .eq("account_id", accountId)
            .eq("profile_id", profileId)
        : await db.from("seller_goals").upsert(
            {
              account_id: accountId,
              profile_id: profileId,
              calls_per_day: next.callsPerDay,
              whatsapp_per_day: next.whatsappPerDay,
              emails_per_day: next.emailsPerDay,
              revenue_per_month: next.revenuePerMonth,
            },
            { onConflict: "account_id,profile_id" },
          );
      if (error) {
        setRowState((s) => ({ ...s, [profileId]: "idle" }));
        toast.error(t("saveFailed"));
        return false;
      }
      const map = new Map(savedRef.current);
      if (empty) map.delete(profileId);
      else map.set(profileId, next);
      savedRef.current = map;
      setSaved(map);
      flash(profileId);
      return true;
    },
    [accountId, flash, t],
  );

  /** Save one box. `rawInput` is what the person typed, read from the input itself. */
  const commit = useCallback(
    async (profileId: string, field: SellerGoalField, rawInput: string) => {
      clearTimeout(timers.current[`${profileId}:${field}`]);
      const raw = rawInput.trim().replace(",", ".");
      const current = savedRef.current.get(profileId) ?? EMPTY_SELLER_GOAL;
      let value: number | null = null;
      if (raw !== "") {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setDrafts((d) => ({
            ...d,
            [profileId]: { ...d[profileId], [field]: toDraft(current[field]) },
          }));
          return;
        }
        value = INTEGER_FIELDS.includes(field) ? Math.min(1000, Math.round(parsed)) : parsed;
      }
      setDrafts((d) => ({
        ...d,
        [profileId]: { ...d[profileId], [field]: toDraft(value) },
      }));
      if (value === current[field]) return;
      const ok = await persist(profileId, { ...current, [field]: value });
      if (!ok) {
        setDrafts((d) => ({
          ...d,
          [profileId]: { ...d[profileId], [field]: toDraft(current[field]) },
        }));
      }
    },
    [persist],
  );

  /** Typing saves by itself after a short pause; leaving the box or Enter saves at once. */
  const schedule = useCallback(
    (profileId: string, field: SellerGoalField, rawInput: string) => {
      const key = `${profileId}:${field}`;
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => {
        void commit(profileId, field, rawInput);
      }, 900);
    },
    [commit],
  );

  const reset = useCallback(
    async (profileId: string) => {
      const ok = await persist(profileId, EMPTY_SELLER_GOAL);
      if (!ok) return;
      setDrafts((d) => ({
        ...d,
        [profileId]: { callsPerDay: "", whatsappPerDay: "", emailsPerDay: "", revenuePerMonth: "" },
      }));
    },
    [persist],
  );

  const totals = useMemo(() => {
    return members.reduce(
      (sum, member) => {
        const g = effectiveSellerGoals(defaults, saved.get(member.id));
        return {
          callsPerDay: sum.callsPerDay + g.callsPerDay,
          whatsappPerDay: sum.whatsappPerDay + g.whatsappPerDay,
          emailsPerDay: sum.emailsPerDay + g.emailsPerDay,
          revenuePerMonth: sum.revenuePerMonth + g.revenuePerMonth,
        };
      },
      { callsPerDay: 0, whatsappPerDay: 0, emailsPerDay: 0, revenuePerMonth: 0 },
    );
  }, [members, saved, defaults]);

  const columns: { key: SellerGoalField; label: string; unit: string; step: string; width: string }[] = [
    { key: "callsPerDay", label: t("calls"), unit: t("perDay"), step: "1", width: "w-32" },
    { key: "whatsappPerDay", label: t("whatsapp"), unit: t("perDay"), step: "1", width: "w-32" },
    { key: "emailsPerDay", label: t("emails"), unit: t("perDay"), step: "1", width: "w-32" },
    { key: "revenuePerMonth", label: t("revenue"), unit: t("perMonth"), step: "1000", width: "w-52" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-separate border-spacing-x-4 text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-44 pb-3 font-medium text-foreground">{t("seller")}</th>
                  {columns.map((col) => (
                    <th key={col.key} className={cn("pb-3 align-bottom font-medium", col.width)}>
                      <span className="block text-foreground">{col.label}</span>
                      <span className="block text-xs font-normal">{col.unit}</span>
                    </th>
                  ))}
                  <th className="w-10 pb-3" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => {
                  const name = member.full_name || member.email || t("unnamed");
                  const override = saved.get(member.id);
                  const state = rowState[member.id] ?? "idle";
                  const customized = override
                    ? SELLER_GOAL_FIELDS.some((field) => override[field] !== null)
                    : false;
                  return (
                    <tr key={member.id}>
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground">
                            {initials(name)}
                          </span>
                          <span className="min-w-0 truncate font-medium text-foreground">{name}</span>
                        </div>
                      </td>
                      {columns.map((col) => {
                        const isCustom = override?.[col.key] != null;
                        const fallback = defaults[col.key];
                        if (col.key === "revenuePerMonth") {
                          const draft = drafts[member.id]?.[col.key] ?? "";
                          const parsed = draft.trim() === "" ? null : Number(draft);
                          return (
                            <td key={col.key} className="py-3">
                              <BrMoneyInput
                                allowEmpty
                                value={parsed}
                                placeholder={fallback === 0 ? t("noGoal") : formatBrMoney(fallback)}
                                onValueChange={(next) => {
                                  const raw = next == null ? "" : String(next);
                                  setDrafts((d) => ({
                                    ...d,
                                    [member.id]: { ...d[member.id], [col.key]: raw },
                                  }));
                                  schedule(member.id, col.key, raw);
                                }}
                                onCommit={(next) =>
                                  void commit(member.id, col.key, next == null ? "" : String(next))
                                }
                                className={cn(
                                  "h-9 rounded-md border bg-muted pr-3 text-sm tabular-nums text-foreground placeholder:text-muted-foreground/70",
                                  isCustom ? "border-primary/50" : "border-transparent",
                                )}
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className="py-3">
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={col.step}
                              aria-label={`${col.label} ${col.unit} — ${name}`}
                              placeholder={fallback === 0 ? t("noGoal") : String(fallback)}
                              value={drafts[member.id]?.[col.key] ?? ""}
                              onChange={(e) => {
                                const next = e.target.value;
                                setDrafts((d) => ({
                                  ...d,
                                  [member.id]: { ...d[member.id], [col.key]: next },
                                }));
                                schedule(member.id, col.key, next);
                              }}
                              onBlur={(e) => void commit(member.id, col.key, e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void commit(member.id, col.key, e.currentTarget.value);
                                }
                              }}
                              className={cn(
                                "h-9 w-full rounded-md border bg-muted px-3 text-sm tabular-nums text-foreground outline-none transition-colors [appearance:textfield] placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                                isCustom ? "border-primary/50" : "border-transparent",
                              )}
                            />
                          </td>
                        );
                      })}
                      <td className="py-3 text-right">
                        <span className="inline-flex h-7 items-center justify-end gap-1">
                          {state === "saving" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label={t("saving")} />
                          ) : state === "saved" ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" aria-label={t("saved")} />
                          ) : customized ? (
                            <button
                              type="button"
                              onClick={() => void reset(member.id)}
                              title={t("reset")}
                              aria-label={`${t("reset")} — ${name}`}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-xs text-muted-foreground">
                  <td className="pt-3 font-medium text-foreground">{t("team", { count: members.length })}</td>
                  {columns.map((col) => (
                    <td key={col.key} className="pt-3 tabular-nums">
                      {/* Only calls add up to a team total. */}
                      {col.key === "callsPerDay" ? totals[col.key].toLocaleString("pt-BR") : ""}
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">{t("footnote")}</p>
      </CardContent>
    </Card>
  );
}
