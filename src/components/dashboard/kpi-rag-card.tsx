'use client'

import type { ComponentType, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { ConsultantSlice, KpiOrigin, RagStatus } from '@/lib/dashboard/aluinter-kpis'

const RAG_BAR: Record<RagStatus, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  na: 'bg-muted-foreground/40',
}

const RAG_TEXT: Record<RagStatus, string> = {
  green: 'text-emerald-600 dark:text-emerald-400',
  yellow: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-600 dark:text-red-400',
  na: 'text-muted-foreground',
}

const RAG_TINT: Record<RagStatus, string> = {
  green: 'border-emerald-500/25 bg-emerald-500/[0.06]',
  yellow: 'border-amber-500/25 bg-amber-500/[0.06]',
  red: 'border-red-500/25 bg-red-500/[0.06]',
  na: 'border-border bg-card',
}

export function RagDot({ rag, label }: { rag: RagStatus; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase', RAG_TEXT[rag])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', RAG_BAR[rag])} />
      {label}
    </span>
  )
}

export function OriginBadge({
  origin,
  label,
}: {
  origin: KpiOrigin
  label: string
}) {
  return (
    <span
      className={cn(
        'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
        origin === 'crm' && 'border-primary/30 bg-primary/10 text-primary',
        origin === 'proxy' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        origin === 'external' && 'border-border bg-muted text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

export function KpiRagCard({
  index,
  title,
  value,
  target,
  rag,
  ragLabel,
  origin,
  originLabel,
  formula,
  owner,
  frequency,
  icon: Icon,
  hint,
  consultants,
  progress,
  children,
}: {
  index: number
  title: string
  value: string
  target: string
  rag: RagStatus
  ragLabel: string
  origin: KpiOrigin
  originLabel: string
  formula: string
  owner: string
  frequency: string
  icon: ComponentType<{ className?: string }>
  hint?: string
  consultants?: ConsultantSlice[]
  progress?: number | null
  children?: ReactNode
}) {
  const t = useTranslations('Dashboard.gestao')
  const pct = progress == null ? null : Math.max(0, Math.min(progress, 1.4))
  const barWidth = pct == null ? 0 : Math.min(pct * 100, 100)

  return (
    <article className={cn('flex flex-col overflow-hidden rounded-2xl border', RAG_TINT[rag])}>
      <div className={cn('h-1 w-full', RAG_BAR[rag])} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {String(index).padStart(2, '0')}
            </p>
            <h3 className="mt-1 text-sm leading-snug font-semibold text-foreground">{title}</h3>
          </div>
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/80', RAG_TEXT[rag])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div>
          <p className="text-[26px] leading-none font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">{target}</p>
        </div>

        {pct != null ? (
          <div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
              <div
                className={cn('h-full rounded-full transition-[width]', RAG_BAR[rag])}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] font-medium text-muted-foreground tabular-nums">
              {t('ofTarget', { pct: Math.round(pct * 100) })}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <RagDot rag={rag} label={ragLabel} />
          <OriginBadge origin={origin} label={originLabel} />
        </div>

        {consultants && consultants.length > 0 ? (
          <ul className="space-y-1.5">
            {consultants.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', RAG_BAR[c.rag])} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="tabular-nums font-medium text-foreground">{c.value}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <details className="group mt-auto border-t border-border/50 pt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            {t('details')}
          </summary>
          <dl className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
            <div>
              <dt className="font-medium text-foreground/70">{t('formulaLabel')}</dt>
              <dd>{formula}</dd>
            </div>
            <div className="flex gap-4">
              <div>
                <dt className="font-medium text-foreground/70">{t('ownerLabel')}</dt>
                <dd>{owner}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground/70">{t('frequencyLabel')}</dt>
                <dd>{frequency}</dd>
              </div>
            </div>
            {hint ? <p>{hint}</p> : null}
          </dl>
        </details>

        {children}
      </div>
    </article>
  )
}
