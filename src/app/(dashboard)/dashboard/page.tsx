"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { LayoutDashboard, Megaphone, Target } from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import { loadAluinterKpis, type AluinterKpiSnapshot } from '@/lib/dashboard/aluinter-kpis'
import { periodLastDay, periodToday, type DashboardPeriod } from '@/lib/dashboard/period'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { GestaoPanel } from '@/components/dashboard/gestao-panel'
import { MarketingPanel } from '@/components/dashboard/marketing-panel'
import { OperacaoPanel } from '@/components/dashboard/operacao-panel'
import { PeriodPicker } from '@/components/dashboard/period-picker'
import { SellerPicker } from '@/components/dashboard/seller-picker'
import type { SellerFilter } from '@/lib/dashboard/seller'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { useTranslations } from 'next-intl'

type DashTab = 'gestao' | 'operacao' | 'marketing'

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const tTabs = useTranslations('Dashboard.tabs')
  const { defaultCurrency } = useAuth()
  const [tab, setTab] = useState<DashTab>('gestao')
  const [period, setPeriod] = useState<DashboardPeriod>(() => periodToday())
  const [sellerId, setSellerId] = useState('all')
  const [sellers, setSellers] = useState<
    { id: string; userId: string | null; name: string }[]
  >([])

  const [kpis, setKpis] = useState<AluinterKpiSnapshot | null>(null)
  const [kpisLoading, setKpisLoading] = useState(true)

  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)

  const [series, setSeries] = useState<ConversationsSeriesPoint[] | null>(null)
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback((range: DashboardPeriod, seller: SellerFilter) => {
    const db = createClient()
    const asOf = periodLastDay(range)

    setKpisLoading(true)
    setMetricsLoading(true)
    setSeriesLoading(true)
    setPipelineLoading(true)
    setResponseTimeLoading(true)
    setActivityLoading(true)

    void loadAluinterKpis(db, range, seller)
      .then((k) => setKpis(k))
      .catch((err) => console.error('[dashboard] aluinter kpis failed:', err))
      .finally(() => setKpisLoading(false))

    void loadMetrics(db, range, seller)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, range, seller)
      .then((s) => setSeries(s))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db, seller)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db, asOf, seller)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50, seller)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    const db = createClient()
    void db
      .from('profiles')
      .select('id, user_id, full_name, email')
      .order('full_name')
      .then(({ data }) => {
        const rows = (data ?? []) as {
          id: string
          user_id: string | null
          full_name: string | null
          email: string | null
        }[]
        setSellers(
          rows
            .map((profile) => ({
              id: profile.id,
              userId: profile.user_id,
              name: profile.full_name || profile.email || 'Vendedor',
            }))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        )
      })
  }, [])

  const sellerFilter = useMemo<SellerFilter>(() => {
    if (sellerId === 'all') return null
    const selected = sellers.find((seller) => seller.id === sellerId)
    return selected ? { profileId: selected.id, userId: selected.userId } : null
  }, [sellerId, sellers])

  useEffect(() => {
    loadAll(period, sellerFilter)
  }, [loadAll, period, sellerFilter])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === 'operacao' ? t('descriptionOps') : tab === 'marketing' ? t('descriptionMkt') : t('description')}
          </p>
        </div>
        {tab !== 'marketing' ? (
          <div className="flex flex-col gap-2 sm:items-end">
            <SellerPicker
              sellerId={sellerId}
              sellers={sellers}
              onChange={setSellerId}
            />
            <PeriodPicker period={period} onChange={setPeriod} />
          </div>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DashTab)}
      >
        <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
          <TabsTrigger value="gestao" className="px-3">
            <Target className="h-4 w-4" />
            {tTabs('gestao')}
          </TabsTrigger>
          <TabsTrigger value="operacao" className="px-3">
            <LayoutDashboard className="h-4 w-4" />
            {tTabs('operacao')}
          </TabsTrigger>
          <TabsTrigger value="marketing" className="px-3">
            <Megaphone className="h-4 w-4" />
            {tTabs('marketing')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gestao" className="mt-5">
          <GestaoPanel data={kpis} loading={kpisLoading} currency={defaultCurrency} />
        </TabsContent>

        <TabsContent value="operacao" className="mt-5">
          <OperacaoPanel
            metrics={metrics}
            metricsLoading={metricsLoading}
            series={series}
            seriesLoading={seriesLoading}
            pipeline={pipeline}
            pipelineLoading={pipelineLoading}
            responseTime={responseTime}
            responseTimeLoading={responseTimeLoading}
            activity={activity}
            activityLoading={activityLoading}
            currency={defaultCurrency}
          />
        </TabsContent>

        <TabsContent value="marketing" className="mt-5">
          <MarketingPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
