'use client'

import {
  Inbox,
  MessageSquare,
  Radio,
  UserPlus,
  Zap,
  Briefcase,
} from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { Skeleton } from '@/components/dashboard/skeleton'
import { cn } from '@/lib/utils'

function deltaLabel(delta: number, suffix: string, noChangeLabel: string): string {
  if (delta === 0) return noChangeLabel
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}

export function OperacaoPanel({
  metrics,
  metricsLoading,
  series,
  seriesLoading,
  pipeline,
  pipelineLoading,
  responseTime,
  responseTimeLoading,
  activity,
  activityLoading,
  currency,
}: {
  metrics: MetricsBundle | null
  metricsLoading: boolean
  series: ConversationsSeriesPoint[] | null
  seriesLoading: boolean
  pipeline: PipelineDonutData | null
  pipelineLoading: boolean
  responseTime: ResponseTimeSummary | null
  responseTimeLoading: boolean
  activity: ActivityItem[] | null
  activityLoading: boolean
  currency: string
}) {
  const t = useTranslations('Dashboard.page')
  const tOps = useTranslations('Dashboard.operacao')
  const tQuick = useTranslations('Dashboard.quickActions')

  const stats = metrics
    ? [
        {
          label: t('activeConversations'),
          value: metrics.activeConversations.current.toLocaleString(),
          hint: deltaLabel(
            metrics.activeConversations.previous,
            tOps('newInPeriod'),
            t('noChange', { suffix: tOps('newInPeriod') }),
          ),
          tone: metrics.activeConversations.previous,
        },
        {
          label: tOps('newContacts'),
          value: metrics.newContactsToday.current.toLocaleString(),
          hint: deltaLabel(
            metrics.newContactsToday.current - metrics.newContactsToday.previous,
            tOps('vsPrevious'),
            t('noChange', { suffix: tOps('vsPrevious') }),
          ),
          tone: metrics.newContactsToday.current - metrics.newContactsToday.previous,
        },
        {
          label: t('openDealsValue'),
          value: formatCurrency(metrics.openDealsValue, currency),
          hint: t('openDeals', { count: metrics.openDealsCount }),
          tone: 0,
        },
        {
          label: tOps('messagesSent'),
          value: metrics.messagesSentToday.current.toLocaleString(),
          hint: deltaLabel(
            metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
            tOps('vsPrevious'),
            t('noChange', { suffix: tOps('vsPrevious') }),
          ),
          tone: metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
        },
      ]
    : null

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          {metricsLoading || !stats
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4">
                  <Skeleton className="h-16 w-full" />
                </div>
              ))
            : stats.map((s) => (
                <div key={s.label} className="px-5 py-4">
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {s.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-foreground">
                    {s.value}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      s.tone > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : s.tone < 0
                          ? 'text-red-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {s.hint}
                  </p>
                </div>
              ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <ConversationsChart data={series} loading={seriesLoading} />
          <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />
        </div>
        <div className="space-y-4">
          <PipelineDonut data={pipeline} loading={pipelineLoading} currency={currency} />
          <nav className="rounded-2xl border border-border bg-card p-3">
            <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {tOps('shortcuts')}
            </p>
            <ul className="grid grid-cols-2 gap-1">
              {(
                [
                  { href: '/inbox', icon: Inbox, label: tOps('inbox') },
                  { href: '/contacts', icon: UserPlus, label: tQuick('newContact') },
                  { href: '/pipelines', icon: Briefcase, label: tQuick('newDeal') },
                  { href: '/broadcasts/new', icon: Radio, label: tQuick('newBroadcast') },
                  { href: '/automations/new', icon: Zap, label: tQuick('newAutomation') },
                  { href: '/inbox', icon: MessageSquare, label: tOps('reply') },
                ] as const
              ).map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted/60"
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          <ActivityFeed items={activity} loading={activityLoading} />
        </div>
      </div>
    </div>
  )
}
