'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency'
import { periodInputValues, type DashboardPeriod } from '@/lib/dashboard/period'
import type { SalesReport } from '@/lib/dashboard/sales-report'
import { SkeletonCard } from '@/components/dashboard/skeleton'

export function SalesReportBar({
  report,
  loading,
  period,
  currency,
}: {
  report: SalesReport | null
  loading: boolean
  period: DashboardPeriod
  currency: string
}) {
  const t = useTranslations('Dashboard.sales')
  const { from, to } = periodInputValues(period)

  if (loading && !report) {
    return <SkeletonCard className="min-h-[140px]" />
  }

  if (!report) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {t('loadError')}
      </section>
    )
  }

  const createdHref = `/pipelines?createdFrom=${from}&createdTo=${to}`
  const wonHref = `/pipelines?status=won&closedFrom=${from}&closedTo=${to}`
  const lostHref = `/pipelines?status=lost&closedFrom=${from}&closedTo=${to}`

  const counts = [
    { key: 'created', label: t('created'), value: report.created, href: createdHref },
    { key: 'won', label: t('won'), value: report.wonCount, href: wonHref, tone: 'text-emerald-600' },
    { key: 'lost', label: t('lost'), value: report.lostCount, href: lostHref, tone: 'text-red-600' },
  ] as const

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground">{t('source')}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('periodLabel', { preset: t(`presets.${period.preset}`) })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {counts.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="rounded-xl border border-border px-3 py-3 transition-colors hover:bg-muted/60"
          >
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${'tone' in item ? item.tone : 'text-foreground'}`}>
              {item.value.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
        <Link href={wonHref} className="rounded-lg px-1 py-1 hover:bg-muted/60">
          <p className="text-[11px] text-muted-foreground">{t('value')}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {formatCurrency(report.wonValue, currency)}
          </p>
        </Link>
        <div className="px-1 py-1">
          <p className="text-[11px] text-muted-foreground">{t('units')}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">{report.wonCount.toLocaleString()}</p>
        </div>
        <div className="px-1 py-1">
          <p className="text-[11px] text-muted-foreground">{t('ticket')}</p>
          <p className="mt-0.5 text-lg font-semibold text-foreground">
            {report.ticket == null ? '—' : formatCurrency(report.ticket, currency)}
          </p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t('lostValue', { value: formatCurrency(report.lostValue, currency) })}</p>
    </section>
  )
}
