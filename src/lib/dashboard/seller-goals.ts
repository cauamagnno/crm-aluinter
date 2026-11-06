import type { DashboardGoals } from './goals'
import type { SellerFilter } from './seller'

/**
 * Per-seller overrides of the account goals. A missing value (null) means
 * "use the account default". Zero means "no goal for this person".
 */
export interface SellerGoalOverride {
  callsPerDay: number | null
  whatsappPerDay: number | null
  emailsPerDay: number | null
  revenuePerMonth: number | null
}

export type SellerGoalField = keyof SellerGoalOverride

export const SELLER_GOAL_FIELDS: readonly SellerGoalField[] = [
  'callsPerDay',
  'whatsappPerDay',
  'emailsPerDay',
  'revenuePerMonth',
] as const

export const EMPTY_SELLER_GOAL: SellerGoalOverride = {
  callsPerDay: null,
  whatsappPerDay: null,
  emailsPerDay: null,
  revenuePerMonth: null,
}

export type SellerGoalRow = {
  profile_id: string
  calls_per_day?: number | string | null
  whatsapp_per_day?: number | string | null
  emails_per_day?: number | string | null
  revenue_per_month?: number | string | null
}

export const SELLER_GOAL_COLUMN: Record<SellerGoalField, string> = {
  callsPerDay: 'calls_per_day',
  whatsappPerDay: 'whatsapp_per_day',
  emailsPerDay: 'emails_per_day',
  revenuePerMonth: 'revenue_per_month',
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function parseSellerGoalRows(
  rows: SellerGoalRow[] | null | undefined,
): Map<string, SellerGoalOverride> {
  const map = new Map<string, SellerGoalOverride>()
  for (const row of rows ?? []) {
    map.set(row.profile_id, {
      callsPerDay: optionalNumber(row.calls_per_day),
      whatsappPerDay: optionalNumber(row.whatsapp_per_day),
      emailsPerDay: optionalNumber(row.emails_per_day),
      revenuePerMonth: optionalNumber(row.revenue_per_month),
    })
  }
  return map
}

/** The goals one seller works towards: their own value, else the account default. */
export function effectiveSellerGoals(
  base: DashboardGoals,
  override?: SellerGoalOverride,
): Pick<DashboardGoals, 'callsPerDay' | 'whatsappPerDay' | 'emailsPerDay' | 'revenuePerMonth'> {
  return {
    callsPerDay: override?.callsPerDay ?? base.callsPerDay,
    whatsappPerDay: override?.whatsappPerDay ?? base.whatsappPerDay,
    emailsPerDay: override?.emailsPerDay ?? base.emailsPerDay,
    revenuePerMonth: override?.revenuePerMonth ?? base.revenuePerMonth,
  }
}

/**
 * Goals for what the dashboard is showing.
 * - One seller: that person's goals.
 * - Everyone: the sum of every seller's goals (team target).
 * Without any seller loaded yet, the account defaults stay as they are.
 */
export function scopeGoals(
  base: DashboardGoals,
  overrides: Map<string, SellerGoalOverride>,
  sellerIds: string[],
  seller: SellerFilter,
): DashboardGoals {
  if (seller) {
    return { ...base, ...effectiveSellerGoals(base, overrides.get(seller.profileId)) }
  }
  if (sellerIds.length === 0) return base
  const total = sellerIds.reduce(
    (sum, id) => {
      const g = effectiveSellerGoals(base, overrides.get(id))
      return {
        callsPerDay: sum.callsPerDay + g.callsPerDay,
        whatsappPerDay: sum.whatsappPerDay + g.whatsappPerDay,
        emailsPerDay: sum.emailsPerDay + g.emailsPerDay,
        revenuePerMonth: sum.revenuePerMonth + g.revenuePerMonth,
      }
    },
    { callsPerDay: 0, whatsappPerDay: 0, emailsPerDay: 0, revenuePerMonth: 0 },
  )
  return { ...base, ...total }
}
