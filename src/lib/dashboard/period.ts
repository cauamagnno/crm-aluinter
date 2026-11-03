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

export type PeriodPreset =
  | 'today'
  | 'week'
  | 'lastWeek'
  | 'month'
  | 'lastMonth'
  | 'last4Months'
  | 'thisYear'
  | 'custom'

export interface DashboardPeriod {
  preset: PeriodPreset
  /** Inclusive local midnight. */
  start: Date
  /** Exclusive local midnight. */
  end: Date
}

export const PERIOD_MAX_DAYS = 366

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

export function periodLastWeek(asOf: Date = new Date()): DashboardPeriod {
  const thisWeek = startOfLocalWeek(asOf)
  return { preset: 'lastWeek', start: addLocalDays(thisWeek, -7), end: thisWeek }
}

export function periodLastMonth(asOf: Date = new Date()): DashboardPeriod {
  const thisMonth = startOfLocalMonth(asOf)
  const start = startOfLocalMonth(addLocalDays(thisMonth, -1))
  return { preset: 'lastMonth', start, end: thisMonth }
}

/** Rolling four months ending today, inclusive of today. */
export function periodLast4Months(asOf: Date = new Date()): DashboardPeriod {
  const endDay = startOfLocalDay(asOf)
  const start = startOfLocalDay(asOf)
  start.setMonth(start.getMonth() - 4)
  return { preset: 'last4Months', start, end: startOfNextLocalDay(endDay) }
}

export function periodThisYear(asOf: Date = new Date()): DashboardPeriod {
  const start = startOfLocalDay(asOf)
  start.setMonth(0, 1)
  const today = startOfLocalDay(asOf)
  return { preset: 'thisYear', start, end: startOfNextLocalDay(today) }
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
  if (preset === 'lastWeek') return periodLastWeek()
  if (preset === 'month') return periodThisMonth()
  if (preset === 'lastMonth') return periodLastMonth()
  if (preset === 'last4Months') return periodLast4Months()
  if (preset === 'thisYear') return periodThisYear()
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
