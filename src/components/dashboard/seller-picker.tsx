'use client'

import { UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function SellerPicker({
  sellerId,
  sellers,
  onChange,
}: {
  sellerId: string
  sellers: { id: string; name: string }[]
  onChange: (sellerId: string) => void
}) {
  const t = useTranslations('Dashboard.page')

  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground">
      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="sr-only">{t('seller')}</span>
      <select
        value={sellerId}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[220px] bg-transparent text-sm outline-none"
      >
        <option value="all">{t('allSellers')}</option>
        {sellers.map((seller) => (
          <option key={seller.id} value={seller.id}>
            {seller.name}
          </option>
        ))}
      </select>
    </label>
  )
}
