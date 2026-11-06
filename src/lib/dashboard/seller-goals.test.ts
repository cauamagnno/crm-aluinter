import { describe, expect, it } from 'vitest'
import { DEFAULT_DASHBOARD_GOALS } from './goals'
import {
  parseSellerGoalRows,
  scopeGoals,
  type SellerGoalOverride,
} from './seller-goals'

const base = DEFAULT_DASHBOARD_GOALS

function overrides(rows: Record<string, Partial<SellerGoalOverride>>) {
  return parseSellerGoalRows(
    Object.entries(rows).map(([profile_id, o]) => ({
      profile_id,
      calls_per_day: o.callsPerDay ?? null,
      whatsapp_per_day: o.whatsappPerDay ?? null,
      emails_per_day: o.emailsPerDay ?? null,
      revenue_per_month: o.revenuePerMonth ?? null,
    })),
  )
}

describe('scopeGoals', () => {
  it('uses the seller own goal when one seller is selected', () => {
    const map = overrides({ a: { callsPerDay: 20 } })
    const goals = scopeGoals(base, map, ['a', 'b'], { profileId: 'a', userId: null })
    expect(goals.callsPerDay).toBe(20)
    expect(goals.whatsappPerDay).toBe(base.whatsappPerDay)
  })

  it('falls back to the account default for a seller without a row', () => {
    const goals = scopeGoals(base, overrides({}), ['a'], { profileId: 'a', userId: null })
    expect(goals.callsPerDay).toBe(base.callsPerDay)
  })

  it('sums every seller for the team view', () => {
    const map = overrides({ a: { callsPerDay: 20 }, b: { callsPerDay: 10 } })
    const goals = scopeGoals(base, map, ['a', 'b', 'c'], null)
    expect(goals.callsPerDay).toBe(20 + 10 + base.callsPerDay)
    expect(goals.revenuePerMonth).toBe(base.revenuePerMonth * 3)
  })

  it('treats zero as no goal for that person', () => {
    const map = overrides({ a: { callsPerDay: 0 } })
    const goals = scopeGoals(base, map, ['a', 'b'], null)
    expect(goals.callsPerDay).toBe(base.callsPerDay)
    expect(scopeGoals(base, map, ['a', 'b'], { profileId: 'a', userId: null }).callsPerDay).toBe(0)
  })

  it('keeps the account defaults while the team is still loading', () => {
    expect(scopeGoals(base, overrides({}), [], null)).toEqual(base)
  })
})
