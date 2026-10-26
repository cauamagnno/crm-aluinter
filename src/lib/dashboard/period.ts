import {
  addLocalDays,
  countLocalDays,
  fromDateInputValue,
  startOfLocalDay,
  startOfLocalMonth,
  startOfLocalWeek,
  startOfNextLocalDay,
  toDateInputValue,
} from './date-utils'

export type PeriodPreset = 'today' | 'week' | 'month' | 'custom'

export interface DashboardPeriod {
  preset: PeriodPreset
  /** Inclusive local midnight. */
  start: Date
  /** Exclusive local midnight. */
  end: Date
}

export const PERIOD_MAX_DAYS = 90

export function periodToday(asOf: Date = new Date()): DashboardPeriod {
  const start = startOfLocalDay(asOf)
  return { preset: 'today', start, end: startOfNextLocalDay(start) }
}

export function periodThisWeek(asOf: Date = new Date()): DashboardPeriod {
  const start = startOfLocalWeek(asOf)
  const today = startOfLocalDay(asOf)
  return { preset: 'week', start, end: startOfNextLocalDay(today) }
}

export function periodThisMonth(asOf: Date = new Date()): DashboardPeriod {
  const start = startOfLocalMonth(asOf)
  const today = startOfLocalDay(asOf)
  return { preset: 'month', start, end: startOfNextLocalDay(today) }
}

export function periodCustom(from: Date, toInclusive: Date): DashboardPeriod {
  let start = startOfLocalDay(from)
  let last = startOfLocalDay(toInclusive)
  if (last < start) {
    const tmp = start
    start = last
    last = tmp
  }
  const today = startOfLocalDay()
  if (last > today) last = today
  const maxStart = addLocalDays(last, -(PERIOD_MAX_DAYS - 1))
  if (start < maxStart) start = maxStart
  return { preset: 'custom', start, end: startOfNextLocalDay(last) }
}

export function periodDays(period: DashboardPeriod): number {
  return Math.max(countLocalDays(period.start, period.end), 1)
}

export function periodLastDay(period: DashboardPeriod): Date {
  return addLocalDays(period.end, -1)
}

export function periodFromInputs(
  preset: PeriodPreset,
  fromValue: string,
  toValue: string,
): DashboardPeriod {
  if (preset === 'today') return periodToday()
  if (preset === 'week') return periodThisWeek()
  if (preset === 'month') return periodThisMonth()
  return periodCustom(fromDateInputValue(fromValue), fromDateInputValue(toValue))
}

export function periodInputValues(period: DashboardPeriod): {
  from: string
  to: string
} {
  return {
    from: toDateInputValue(period.start),
    to: toDateInputValue(periodLastDay(period)),
  }
}
