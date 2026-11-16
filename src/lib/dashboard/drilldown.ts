import { periodInputValues, type DashboardPeriod } from './period'
import type { SellerFilter } from './seller'

/**
 * Links from a dashboard number to the list that composes it. Each helper
 * takes the same period and seller that produced the number, so the list
 * shows the same set of rows.
 */

/** Negotiations list (/pipelines). `owner` is a profiles.id. */
export function pipelinesDrilldownHref(opts: {
  status: 'all' | 'open' | 'won' | 'lost'
  period?: DashboardPeriod
  /** Which timestamp the period applies to: creation or closing. */
  dateField?: 'created' | 'closed'
  seller?: SellerFilter
}): string {
  const params = new URLSearchParams()
  params.set('status', opts.status)
  if (opts.period && opts.dateField) {
    const { from, to } = periodInputValues(opts.period)
    if (opts.dateField === 'created') {
      params.set('createdFrom', from)
      params.set('createdTo', to)
    } else {
      params.set('closedFrom', from)
      params.set('closedTo', to)
    }
  }
  if (opts.seller) params.set('owner', opts.seller.profileId)
  return `/pipelines?${params.toString()}`
}

/** Conversations inbox filtered by status and, optionally, by the agent's auth user id. */
export function inboxDrilldownHref(opts: {
  status: 'open' | 'pending' | 'closed'
  seller?: SellerFilter
}): string {
  const params = new URLSearchParams()
  params.set('status', opts.status)
  if (opts.seller?.userId) params.set('agent', opts.seller.userId)
  return `/inbox?${params.toString()}`
}

/** Contacts created in the period. Contacts belong to the whole account. */
export function contactsDrilldownHref(period: DashboardPeriod): string {
  const { from, to } = periodInputValues(period)
  const params = new URLSearchParams({ createdFrom: from, createdTo: to })
  return `/contacts?${params.toString()}`
}
