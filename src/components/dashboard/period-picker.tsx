'use client'

import { CalendarRange } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { BrDateInput } from '@/components/ui/br-date-input'
import {
  periodFromInputs,
  periodInputValues,
  periodLast4Months,
  periodLastMonth,
  periodLastWeek,
  periodThisMonth,
  periodThisWeek,
  periodThisYear,
  periodToday,
  type DashboardPeriod,
  type PeriodPreset,
} from '@/lib/dashboard/period'
const PRESETS: PeriodPreset[] = [
  'today',
  'week',
  'lastWeek',
  'month',
  'lastMonth',
  'last4Months',
  'thisYear',
]

export function PeriodPicker({
  period,
  onChange,
}: {
  period: DashboardPeriod
  onChange: (next: DashboardPeriod) => void
}) {
  const t = useTranslations('Dashboard.period')
  const values = periodInputValues(period)

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
                    : preset === 'lastWeek'
                      ? periodLastWeek()
                      : preset === 'month'
                        ? periodThisMonth()
                        : preset === 'lastMonth'
                          ? periodLastMonth()
                          : preset === 'last4Months'
                            ? periodLast4Months()
                            : periodThisYear(),
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
          <BrDateInput
            aria-label={t('from')}
            value={values.from}
            onValueChange={(iso) => {
              if (!iso) return
              onChange(periodFromInputs('custom', iso, values.to))
            }}
            className="h-7 w-[7.5rem] border-0 bg-transparent px-1 text-foreground shadow-none"
          />
        </label>
        <span aria-hidden>—</span>
        <label className="inline-flex items-center gap-1.5">
          <span className="sr-only">{t('to')}</span>
          <BrDateInput
            aria-label={t('to')}
            value={values.to}
            onValueChange={(iso) => {
              if (!iso) return
              onChange(periodFromInputs('custom', values.from, iso))
            }}
            className="h-7 w-[7.5rem] border-0 bg-transparent px-1 text-foreground shadow-none"
          />
        </label>
      </div>
    </div>
  )
}
