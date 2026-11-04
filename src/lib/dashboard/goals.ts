export interface DashboardGoals {
  conversationsPerDay: number
  callsPerDay: number
  whatsappPerDay: number
  emailsPerDay: number
  quotesPerWeek: number
  curveAPct: number
  followUpPct: number
  revenuePerMonth: number
  newReactivatedPerMonth: number
}

export const DEFAULT_DASHBOARD_GOALS: DashboardGoals = {
  conversationsPerDay: 15,
  callsPerDay: 15,
  whatsappPerDay: 15,
  emailsPerDay: 15,
  quotesPerWeek: 12,
  curveAPct: 100,
  followUpPct: 90,
  revenuePerMonth: 400_000,
  newReactivatedPerMonth: 12,
}

export type GoalRow = {
  conversations_per_day?: number | string | null
  calls_per_day?: number | string | null
  whatsapp_per_day?: number | string | null
  emails_per_day?: number | string | null
  quotes_per_week?: number | string | null
  curve_a_pct?: number | string | null
  follow_up_pct?: number | string | null
  revenue_per_month?: number | string | null
  new_reactivated_per_month?: number | string | null
}

function positiveInt(value: unknown, fallback: number, max = 10_000) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(1, Math.round(n)))
}

function pct(value: unknown, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(100, Math.max(0, n))
}

function money(value: unknown, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, n)
}

export function parseDashboardGoals(row?: GoalRow | null): DashboardGoals {
  const d = DEFAULT_DASHBOARD_GOALS
  if (!row) return { ...d }
  return {
    conversationsPerDay: positiveInt(row.conversations_per_day, d.conversationsPerDay, 1000),
    callsPerDay: positiveInt(row.calls_per_day, d.callsPerDay, 1000),
    whatsappPerDay: positiveInt(row.whatsapp_per_day, d.whatsappPerDay, 1000),
    emailsPerDay: positiveInt(row.emails_per_day, d.emailsPerDay, 1000),
    quotesPerWeek: positiveInt(row.quotes_per_week, d.quotesPerWeek, 1000),
    curveAPct: pct(row.curve_a_pct, d.curveAPct),
    followUpPct: pct(row.follow_up_pct, d.followUpPct),
    revenuePerMonth: money(row.revenue_per_month, d.revenuePerMonth),
    newReactivatedPerMonth: positiveInt(row.new_reactivated_per_month, d.newReactivatedPerMonth),
  }
}

export function goalsToRow(accountId: string, goals: DashboardGoals) {
  return {
    account_id: accountId,
    conversations_per_day: goals.conversationsPerDay,
    calls_per_day: goals.callsPerDay,
    whatsapp_per_day: goals.whatsappPerDay,
    emails_per_day: goals.emailsPerDay,
    quotes_per_week: goals.quotesPerWeek,
    curve_a_pct: goals.curveAPct,
    follow_up_pct: goals.followUpPct,
    revenue_per_month: goals.revenuePerMonth,
    new_reactivated_per_month: goals.newReactivatedPerMonth,
  }
}

export function yellowMin(target: number, ratio = 0.65) {
  return Math.max(target * ratio, 0)
}
