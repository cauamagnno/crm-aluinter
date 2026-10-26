import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysInLocalMonth,
  localDayKey,
  startOfLocalDay,
  startOfLocalMonth,
} from './date-utils'
import { periodDays, periodLastDay, type DashboardPeriod } from './period'

export const ALUINTER = {
  conversationsPerDay: { target: 12, yellowMin: 8 },
  quotesPerWeek: { target: 12, yellowMin: 9 },
  curveA: { target: 1, yellowMin: 0.8 },
  followUp: { target: 0.9, yellowMin: 0.7, windowDays: 7 },
  revenuePerPortfolio: 400_000,
  newReactivated: { target: 12, yellowMin: 8 },
  reactivationDays: 90,
  retractionRatio: 0.7,
} as const

export type RagStatus = 'green' | 'yellow' | 'red' | 'na'
export type KpiOrigin = 'crm' | 'proxy' | 'external'

export interface ConsultantSlice {
  id: string
  name: string
  value: number
  rag: RagStatus
}

export interface AluinterKpiSnapshot {
  periodDays: number
  realConversations: {
    today: number
    average: number
    dailyTarget: number
    consultants: ConsultantSlice[]
  }
  quotes: {
    thisWeek: number
    average: number
    periodTarget: number
    consultants: ConsultantSlice[]
  }
  curveA: {
    total: number
    contacted: number
    ratio: number | null
    classified: boolean
  }
  followUp: {
    openQuotes: number
    onCadence: number
    ratio: number | null
  }
  revenue: {
    wonThisMonth: number
    target: number
    paceRatio: number | null
  }
  newReactivated: {
    novos: number
    reactivated: number
    total: number
  }
  retraction: {
    shrinking: number
  }
}

type DealRow = {
  id: string
  value: number | null
  status: string
  contact_id: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

type DB = SupabaseClient

export function ragHigherIsBetter(
  value: number,
  greenMin: number,
  yellowMin: number,
): RagStatus {
  if (value >= greenMin) return 'green'
  if (value >= yellowMin) return 'yellow'
  return 'red'
}

export function ragPace(paceRatio: number | null): RagStatus {
  if (paceRatio == null) return 'na'
  if (paceRatio >= 1) return 'green'
  if (paceRatio >= 0.85) return 'yellow'
  return 'red'
}

function isCurveATag(name: string): boolean {
  const n = name.trim().toLowerCase()
  return n === 'a' || n === 'curva a' || n === 'curva-a' || n === 'curva_a'
}

function consultantName(
  id: string | null,
  names: Map<string, string>,
): { id: string; name: string } {
  if (!id) return { id: 'unassigned', name: 'Sem responsável' }
  return { id, name: names.get(id) ?? 'Consultor' }
}

function toSlices(
  map: Map<string, number>,
  names: Map<string, string>,
  green: number,
  yellow: number,
  perDayDivisor = 1,
): ConsultantSlice[] {
  const div = Math.max(perDayDivisor, 1)
  return [...map.entries()]
    .map(([id, value]) => {
      const meta = consultantName(id === 'unassigned' ? null : id, names)
      return {
        id: meta.id,
        name: meta.name,
        value,
        rag: ragHigherIsBetter(value / div, green, yellow),
      }
    })
    .sort((a, b) => b.value - a.value)
}

export async function loadAluinterKpis(
  db: DB,
  period: DashboardPeriod,
): Promise<AluinterKpiSnapshot> {
  const asOf = periodLastDay(period)
  const days = periodDays(period)
  const todayStart = period.start
  const periodEnd = period.end
  const cadenceStart = startOfLocalDay(asOf)
  cadenceStart.setDate(cadenceStart.getDate() - ALUINTER.followUp.windowDays)
  const nextMonth = startOfLocalMonth(asOf)
  nextMonth.setMonth(nextMonth.getMonth() + 1)

  const [
    messagesToday,
    conversations,
    deals,
    tags,
    contactTags,
    profiles,
  ] = await Promise.all([
    db
      .from('messages')
      .select('conversation_id, sender_type, created_at')
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', periodEnd.toISOString()),
    db.from('conversations').select('id, contact_id, assigned_agent_id, last_message_at'),
    db
      .from('deals')
      .select('id, value, status, contact_id, assigned_to, created_at, updated_at'),
    db.from('tags').select('id, name'),
    db.from('contact_tags').select('contact_id, tag_id'),
    db.from('profiles').select('id, user_id, full_name'),
  ])

  const names = new Map<string, string>()
  const profileByUserId = new Map<string, string>()
  for (const p of (profiles.data ?? []) as {
    id: string
    user_id: string | null
    full_name: string | null
  }[]) {
    if (p.full_name) names.set(p.id, p.full_name)
    // Conversations.assigned_agent_id is auth.users.id; deals.assigned_to is profiles.id.
    if (p.user_id) {
      profileByUserId.set(p.user_id, p.id)
      if (p.full_name) names.set(p.user_id, p.full_name)
    }
  }

  const asConsultantId = (id: string | null | undefined, fromUserId: boolean) => {
    if (!id) return 'unassigned'
    if (fromUserId) return profileByUserId.get(id) ?? id
    return id
  }

  const convById = new Map<
    string,
    { contact_id: string | null; assigned_agent_id: string | null; last_message_at: string | null }
  >()
  const convByContact = new Map<string, string>()
  for (const c of (conversations.data ?? []) as {
    id: string
    contact_id: string | null
    assigned_agent_id: string | null
    last_message_at: string | null
  }[]) {
    convById.set(c.id, c)
    if (c.contact_id) convByContact.set(c.contact_id, c.id)
  }

  const parties = new Map<string, { customer: boolean; agent: boolean }>()
  for (const m of (messagesToday.data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]) {
    const key = `${m.conversation_id}|${localDayKey(m.created_at)}`
    const row = parties.get(key) ?? { customer: false, agent: false }
    if (m.sender_type === 'customer') row.customer = true
    if (m.sender_type === 'agent' || m.sender_type === 'bot') row.agent = true
    parties.set(key, row)
  }

  const realByConsultant = new Map<string, number>()
  let realToday = 0
  for (const [key, flags] of parties) {
    if (!flags.customer || !flags.agent) continue
    realToday += 1
    const convId = key.split('|')[0]
    const conv = convById.get(convId)
    const consultant = asConsultantId(conv?.assigned_agent_id, true)
    realByConsultant.set(consultant, (realByConsultant.get(consultant) ?? 0) + 1)
  }

  const dealRows = (deals.data ?? []) as DealRow[]
  const quoteByConsultant = new Map<string, number>()
  let quotesThisWeek = 0
  for (const d of dealRows) {
    const created = new Date(d.created_at)
    if (created < todayStart || created >= periodEnd) continue
    quotesThisWeek += 1
    const consultant = asConsultantId(d.assigned_to, false)
    quoteByConsultant.set(consultant, (quoteByConsultant.get(consultant) ?? 0) + 1)
  }

  const curveTagIds = new Set(
    ((tags.data ?? []) as { id: string; name: string }[])
      .filter((t) => isCurveATag(t.name))
      .map((t) => t.id),
  )
  const curveContacts = new Set<string>()
  for (const row of (contactTags.data ?? []) as { contact_id: string; tag_id: string }[]) {
    if (curveTagIds.has(row.tag_id)) curveContacts.add(row.contact_id)
  }
  let curveContacted = 0
  for (const contactId of curveContacts) {
    const convId = convByContact.get(contactId)
    const conv = convId ? convById.get(convId) : undefined
    const at = conv?.last_message_at ? new Date(conv.last_message_at) : null
    if (at && at >= todayStart && at < periodEnd) curveContacted += 1
  }

  const openDeals = dealRows.filter((d) => d.status === 'open')
  let onCadence = 0
  for (const d of openDeals) {
    const convId = d.contact_id ? convByContact.get(d.contact_id) : undefined
    const lastConv = convId ? convById.get(convId)?.last_message_at : null
    const lastTouch = lastConv ?? d.updated_at
    if (lastTouch && new Date(lastTouch) >= cadenceStart) onCadence += 1
  }

  let wonThisMonth = 0
  const wonByContact = new Map<string, { at: Date; value: number }[]>()
  for (const d of dealRows) {
    if (d.status !== 'won') continue
    const at = new Date(d.updated_at)
    const value = d.value ?? 0
    if (at >= todayStart && at < periodEnd) wonThisMonth += value
    if (!d.contact_id) continue
    const list = wonByContact.get(d.contact_id) ?? []
    list.push({ at, value })
    wonByContact.set(d.contact_id, list)
  }

  const reactivationMs = ALUINTER.reactivationDays * 24 * 60 * 60 * 1000
  let novos = 0
  let reactivated = 0
  for (const [, events] of wonByContact) {
    events.sort((a, b) => a.at.getTime() - b.at.getTime())
    const first = events[0]
    const inPeriod = events.filter((e) => e.at >= todayStart && e.at < periodEnd)
    if (inPeriod.length === 0) continue
    if (first.at >= todayStart) {
      novos += 1
      continue
    }
    const previous = events.filter((e) => e.at < todayStart)
    const lastPrev = previous[previous.length - 1]
    if (lastPrev && todayStart.getTime() - lastPrev.at.getTime() >= reactivationMs) {
      reactivated += 1
    }
  }

  const monthStartAt = (offset: number) => {
    const d = startOfLocalMonth(asOf)
    d.setMonth(d.getMonth() + offset)
    return d
  }
  const bounds = [monthStartAt(-3), monthStartAt(-2), monthStartAt(-1), monthStartAt(0), nextMonth]
  let shrinking = 0
  for (const [, events] of wonByContact) {
    const sumBetween = (from: Date, to: Date) =>
      events.filter((e) => e.at >= from && e.at < to).reduce((s, e) => s + e.value, 0)
    const thisMonthVal = sumBetween(bounds[3], bounds[4])
    const prev3 =
      (sumBetween(bounds[0], bounds[1]) +
        sumBetween(bounds[1], bounds[2]) +
        sumBetween(bounds[2], bounds[3])) /
      3
    if (prev3 > 0 && thisMonthVal < prev3 * ALUINTER.retractionRatio) shrinking += 1
  }

  const dim = daysInLocalMonth(asOf)
  const periodTarget =
    period.preset === 'month'
      ? ALUINTER.revenuePerPortfolio
      : ALUINTER.revenuePerPortfolio * (days / dim)
  const expected =
    period.preset === 'month'
      ? ALUINTER.revenuePerPortfolio * (asOf.getDate() / dim)
      : periodTarget
  const paceRatio =
    expected > 0 ? wonThisMonth / expected : wonThisMonth > 0 ? 1 : null

  const consultantCount = Math.max(
    new Set([...realByConsultant.keys(), ...quoteByConsultant.keys()]).size,
    1,
  )
  const quoteTarget = ALUINTER.quotesPerWeek.target * (days / 7)
  const dailyAvg = realToday / days / consultantCount
  const quoteAvg = quotesThisWeek / consultantCount

  return {
    periodDays: days,
    realConversations: {
      today: realToday,
      average: dailyAvg,
      dailyTarget: ALUINTER.conversationsPerDay.target,
      consultants: toSlices(
        realByConsultant,
        names,
        ALUINTER.conversationsPerDay.target,
        ALUINTER.conversationsPerDay.yellowMin,
        days,
      ),
    },
    quotes: {
      thisWeek: quotesThisWeek,
      average: quoteAvg,
      periodTarget: quoteTarget,
      consultants: toSlices(
        quoteByConsultant,
        names,
        quoteTarget,
        ALUINTER.quotesPerWeek.yellowMin * (days / 7),
      ),
    },
    curveA: {
      total: curveContacts.size,
      contacted: curveContacted,
      ratio: curveContacts.size > 0 ? curveContacted / curveContacts.size : null,
      classified: curveContacts.size > 0,
    },
    followUp: {
      openQuotes: openDeals.length,
      onCadence,
      ratio: openDeals.length > 0 ? onCadence / openDeals.length : null,
    },
    revenue: {
      wonThisMonth,
      target: periodTarget,
      paceRatio,
    },
    newReactivated: {
      novos,
      reactivated,
      total: novos + reactivated,
    },
    retraction: {
      shrinking,
    },
  }
}
