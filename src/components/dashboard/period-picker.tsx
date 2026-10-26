'use client'

import { CalendarRange } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  periodFromInputs,
  periodInputValues,
  periodThisMonth,
  periodThisWeek,
  periodToday,
  type DashboardPeriod,
  type PeriodPreset,
} from '@/lib/dashboard/period'
import { toDateInputValue } from '@/lib/dashboard/date-utils'

const PRESETS: PeriodPreset[] = ['today', 'week', 'month']

export function PeriodPicker({
  period,
  onChange,
}: {
  period: DashboardPeriod
  onChange: (next: DashboardPeriod) => void
}) {
  const t = useTranslations('Dashboard.period')
  const values = periodInputValues(period)
  const max = toDateInputValue(new Date())

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={period.preset === preset ? 'secondary' : 'ghost'}
            onClick={() =>
              onChange(
                preset === 'today'
                  ? periodToday()
                  : preset === 'week'
                    ? periodThisWeek()
                    : periodThisMonth(),
              )
            }
          >
            {t(preset)}
          </Button>
        ))}
      </div>
      <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 shrink-0" />
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">{t('from')}</span>
          <input
            type="date"
            value={values.from}
            max={values.to}
            onChange={(e) => {
              if (!e.target.value) return
              onChange(periodFromInputs('custom', e.target.value, values.to))
            }}
            className="bg-transparent text-foreground outline-none"
          />
        </label>
        <span aria-hidden>—</span>
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">{t('to')}</span>
          <input
            type="date"
            value={values.to}
            min={values.from}
            max={max}
            onChange={(e) => {
              if (!e.target.value) return
              onChange(periodFromInputs('custom', values.from, e.target.value))
            }}
            className="bg-transparent text-foreground outline-none"
          />
        </label>
      </div>
    </div>
  )
}
