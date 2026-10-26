'use client'

import {
  BarChart3,
  CircleDollarSign,
  Funnel,
  Megaphone,
  MousePointerClick,
  UserPlus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MetricCard } from '@/components/dashboard/metric-card'

const FUNNEL = [
  { key: 'impressions', icon: BarChart3 },
  { key: 'clicks', icon: MousePointerClick },
  { key: 'leads', icon: UserPlus },
  { key: 'conversations', icon: Megaphone },
  { key: 'deals', icon: CircleDollarSign },
] as const

export function MarketingPanel() {
  const t = useTranslations('Dashboard.marketing')

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-primary/25 bg-primary/5 p-5">
        <p className="text-sm font-semibold text-foreground">{t('bannerTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('bannerBody')}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={t('spend')} value="—" icon={CircleDollarSign} subtitle={t('awaitingBm')} />
        <MetricCard title={t('leads')} value="—" icon={UserPlus} subtitle={t('awaitingBm')} />
        <MetricCard title={t('cpl')} value="—" icon={MousePointerClick} subtitle={t('awaitingBm')} />
        <MetricCard title={t('roas')} value="—" icon={Funnel} subtitle={t('awaitingBm')} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Funnel className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">{t('funnelTitle')}</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('funnelHint')}</p>
        <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {FUNNEL.map((step, i) => {
            const Icon = step.icon
            return (
              <li
                key={step.key}
                className="relative rounded-lg border border-dashed border-border bg-muted/30 p-4"
              >
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <Icon className="mt-3 h-5 w-5 text-primary" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  {t(`funnel.${step.key}`)}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-muted-foreground">—</p>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">{t('campaignsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('campaignsHint')}</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs tracking-wider text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('colCampaign')}</th>
                <th className="px-4 py-3 font-semibold">{t('colSpend')}</th>
                <th className="px-4 py-3 font-semibold">{t('colLeads')}</th>
                <th className="px-4 py-3 font-semibold">{t('colCpl')}</th>
                <th className="px-4 py-3 font-semibold">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  {t('campaignsEmpty')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
