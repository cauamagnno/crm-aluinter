'use client'

import {
  Activity,
  BadgePercent,
  Handshake,
  MessagesSquare,
  PhoneCall,
  Target,
  TrendingDown,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { formatCurrency } from '@/lib/currency'
import {
  ALUINTER,
  ragHigherIsBetter,
  ragPace,
  type AluinterKpiSnapshot,
  type RagStatus,
} from '@/lib/dashboard/aluinter-kpis'
import { KpiRagCard, RagDot } from '@/components/dashboard/kpi-rag-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'

function ragLabel(t: ReturnType<typeof useTranslations>, rag: RagStatus) {
  return t(`rag.${rag}`)
}

function pct(value: number | null) {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

export function GestaoPanel({
  data,
  loading,
  currency,
}: {
  data: AluinterKpiSnapshot | null
  loading: boolean
  currency: string
}) {
  const t = useTranslations('Dashboard.gestao')

  if (!loading && !data) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {t('loadError')}
      </section>
    )
  }

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} className="min-h-[220px]" />
        ))}
      </div>
    )
  }

  const convRag = ragHigherIsBetter(
    data.realConversations.average,
    data.realConversations.dailyTarget,
    ALUINTER.conversationsPerDay.yellowMin,
  )
  const quoteRag = ragHigherIsBetter(
    data.quotes.thisWeek,
    data.quotes.periodTarget,
    Math.max(data.quotes.periodTarget * 0.75, 1),
  )
  const curveRag = data.curveA.ratio == null
    ? 'na'
    : ragHigherIsBetter(
        data.curveA.ratio,
        ALUINTER.curveA.target,
        ALUINTER.curveA.yellowMin,
      )
  const followRag = data.followUp.ratio == null
    ? 'na'
    : ragHigherIsBetter(
        data.followUp.ratio,
        ALUINTER.followUp.target,
        ALUINTER.followUp.yellowMin,
      )
  const revenueRag = ragPace(data.revenue.paceRatio)
  const newTarget = ALUINTER.newReactivated.target * (data.periodDays / 30)
  const newRag = ragHigherIsBetter(
    data.newReactivated.total,
    Math.max(newTarget, 1),
    Math.max(ALUINTER.newReactivated.yellowMin * (data.periodDays / 30), 1),
  )
  const retractionRag =
    data.retraction.shrinking === 0
      ? 'green'
      : data.retraction.shrinking <= 3
        ? 'yellow'
        : 'red'

  const rags: RagStatus[] = [
    convRag, quoteRag, curveRag, followRag, revenueRag, newRag, 'na', retractionRag,
  ]
  const health = {
    green: rags.filter((r) => r === 'green').length,
    yellow: rags.filter((r) => r === 'yellow').length,
    red: rags.filter((r) => r === 'red').length,
    na: rags.filter((r) => r === 'na').length,
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{t('healthTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('healthHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {rags.map((rag, i) => (
              <span key={`${rag}-${i}`} className={`h-2 w-2 rounded-full ${
                rag === 'green' ? 'bg-emerald-500' :
                rag === 'yellow' ? 'bg-amber-500' :
                rag === 'red' ? 'bg-red-500' : 'bg-muted-foreground/40'
              }`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <RagDot rag="green" label={t('healthCount', { count: health.green, rag: ragLabel(t, 'green') })} />
            <RagDot rag="yellow" label={t('healthCount', { count: health.yellow, rag: ragLabel(t, 'yellow') })} />
            <RagDot rag="red" label={t('healthCount', { count: health.red, rag: ragLabel(t, 'red') })} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{t('effortTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('effortHint')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiRagCard
            index={1}
            title={t('k1.title')}
            value={data.realConversations.today.toLocaleString()}
            target={t('k1.targetAvg', {
              avg: data.realConversations.average.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              }),
            })}
            rag={convRag}
            ragLabel={ragLabel(t, convRag)}
            origin="crm"
            originLabel={t('origin.crm')}
            formula={t('k1.formula')}
            owner={t('ownerConsultant')}
            frequency={t('k1.frequency')}
            icon={PhoneCall}
            hint={t('k1.hint')}
            consultants={data.realConversations.consultants}
            progress={data.realConversations.average / data.realConversations.dailyTarget}
          />
          <KpiRagCard
            index={2}
            title={t('k2.title')}
            value={data.quotes.thisWeek.toLocaleString()}
            target={t('k2.targetPeriod', {
              target: Math.round(data.quotes.periodTarget).toLocaleString(),
            })}
            rag={quoteRag}
            ragLabel={ragLabel(t, quoteRag)}
            origin="proxy"
            originLabel={t('origin.proxy')}
            formula={t('k2.formula')}
            owner={t('ownerConsultant')}
            frequency={t('k2.frequency')}
            icon={Handshake}
            hint={t('k2.hint')}
            consultants={data.quotes.consultants}
            progress={
              data.quotes.periodTarget > 0
                ? data.quotes.thisWeek / data.quotes.periodTarget
                : null
            }
          />
          <KpiRagCard
            index={3}
            title={t('k3.title')}
            value={pct(data.curveA.ratio)}
            target={t('k3.target')}
            rag={curveRag}
            ragLabel={ragLabel(t, curveRag)}
            origin="crm"
            originLabel={t('origin.crm')}
            formula={t('k3.formula')}
            owner={t('ownerConsultant')}
            frequency={t('k3.frequency')}
            icon={Users}
            hint={
              data.curveA.classified
                ? t('k3.hintReady', {
                    contacted: data.curveA.contacted,
                    total: data.curveA.total,
                  })
                : t('k3.hintEmpty')
            }
            progress={data.curveA.ratio}
          />
          <KpiRagCard
            index={4}
            title={t('k4.title')}
            value={pct(data.followUp.ratio)}
            target={t('k4.target')}
            rag={followRag}
            ragLabel={ragLabel(t, followRag)}
            origin="crm"
            originLabel={t('origin.crm')}
            formula={t('k4.formula')}
            owner={t('ownerConsultant')}
            frequency={t('k4.frequency')}
            icon={Activity}
            hint={t('k4.hint', {
              onCadence: data.followUp.onCadence,
              open: data.followUp.openQuotes,
            })}
            progress={data.followUp.ratio}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{t('resultTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('resultHint')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiRagCard
            index={5}
            title={t('k5.title')}
            value={formatCurrency(data.revenue.wonThisMonth, currency)}
            target={t('k5.target', {
              target: formatCurrency(data.revenue.target, currency),
            })}
            rag={revenueRag}
            ragLabel={ragLabel(t, revenueRag)}
            origin="proxy"
            originLabel={t('origin.proxy')}
            formula={t('k5.formula')}
            owner={t('ownerSupervision')}
            frequency={t('k5.frequency')}
            icon={Target}
            hint={t('k5.hint')}
            progress={data.revenue.paceRatio}
          />
          <KpiRagCard
            index={6}
            title={t('k6.title')}
            value={data.newReactivated.total.toLocaleString()}
            target={t('k6.target')}
            rag={newRag}
            ragLabel={ragLabel(t, newRag)}
            origin="proxy"
            originLabel={t('origin.proxy')}
            formula={t('k6.formula')}
            owner={t('ownerConsultant')}
            frequency={t('k6.frequency')}
            icon={MessagesSquare}
            hint={t('k6.hint', {
              novos: data.newReactivated.novos,
              reactivated: data.newReactivated.reactivated,
            })}
            progress={newTarget > 0 ? data.newReactivated.total / newTarget : null}
          />
          <KpiRagCard
            index={7}
            title={t('k7.title')}
            value="—"
            target={t('k7.target')}
            rag="na"
            ragLabel={ragLabel(t, 'na')}
            origin="external"
            originLabel={t('origin.easy')}
            formula={t('k7.formula')}
            owner={t('ownerSupervision')}
            frequency={t('k7.frequency')}
            icon={BadgePercent}
            hint={t('k7.hint')}
          />
          <KpiRagCard
            index={8}
            title={t('k8.title')}
            value={data.retraction.shrinking.toLocaleString()}
            target={t('k8.target')}
            rag={retractionRag}
            ragLabel={ragLabel(t, retractionRag)}
            origin="proxy"
            originLabel={t('origin.proxy')}
            formula={t('k8.formula')}
            owner={t('ownerSupervision')}
            frequency={t('k8.frequency')}
            icon={TrendingDown}
            hint={t('k8.hint')}
            progress={data.retraction.shrinking === 0 ? 1 : Math.max(0, 1 - data.retraction.shrinking / 6)}
          />
        </div>
      </section>
    </div>
  )
}
