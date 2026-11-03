'use client'

import { UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  const selected =
    sellerId === 'all'
      ? t('allSellers')
      : sellers.find((seller) => seller.id === sellerId)?.name ?? t('allSellers')

  return (
    <Select value={sellerId} onValueChange={(value) => value && onChange(value)}>
      <SelectTrigger
        aria-label={t('seller')}
        className="h-9 w-[240px] max-w-full border-border bg-card text-foreground"
      >
        <UserRound className="size-3.5 text-muted-foreground" />
        <SelectValue>{selected}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="max-h-72 w-max min-w-[240px]">
        <SelectItem value="all">{t('allSellers')}</SelectItem>
        {sellers.map((seller) => (
          <SelectItem key={seller.id} value={seller.id}>
            {seller.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
