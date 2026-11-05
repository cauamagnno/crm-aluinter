"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrDateInput } from "@/components/ui/br-date-input";
import { BrMoneyInput } from "@/components/ui/br-money-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  countActiveFilters,
  type DealFilterState,
} from "./deal-filters";

export function DealFiltersSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: DealFilterState;
  onChange: (next: DealFilterState) => void;
  onClear: () => void;
}) {
  const t = useTranslations("Pipelines.filters");
  const tPage = useTranslations("Pipelines.page");
  const count = countActiveFilters(filters);

  const set = <K extends keyof DealFilterState>(key: K, value: DealFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-popover p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>
            {tPage("filtersCount", { count })}
          </SheetTitle>
        </SheetHeader>
        <div className="flex h-[calc(100%-8rem)] flex-col gap-4 overflow-y-auto px-5 py-4">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={filters.withoutTask}
              onChange={(e) => set("withoutTask", e.target.checked)}
              className="size-4 accent-primary"
            />
            {t("withoutTask")}
          </label>

          <div className="grid gap-1.5">
            <Label>{t("name")}</Label>
            <Input
              value={filters.name}
              onChange={(e) => set("name", e.target.value)}
              className="bg-muted"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>{t("value")}</Label>
            <div className="flex items-center gap-2">
              <BrMoneyInput
                value={filters.valueMin === "" ? null : Number(filters.valueMin)}
                onValueChange={(amount) => set("valueMin", amount == null ? "" : String(amount))}
                allowEmpty
                placeholder={t("valueFrom")}
                className="bg-muted"
              />
              <span className="text-xs text-muted-foreground">{t("valueTo")}</span>
              <BrMoneyInput
                value={filters.valueMax === "" ? null : Number(filters.valueMax)}
                onValueChange={(amount) => set("valueMax", amount == null ? "" : String(amount))}
                allowEmpty
                className="bg-muted"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>{t("createdAt")}</Label>
            <BrDateInput
              value={filters.createdFrom}
              onValueChange={(iso) => set("createdFrom", iso)}
              className="bg-muted"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>{t("closeDate")}</Label>
            <BrDateInput
              value={filters.closeFrom}
              onValueChange={(iso) => set("closeFrom", iso)}
              className="bg-muted"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>{t("nextTask")}</Label>
            <BrDateInput
              value={filters.nextTaskFrom}
              onValueChange={(iso) => set("nextTaskFrom", iso)}
              className="bg-muted"
            />
          </div>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClear}>
            {t("clear")}
          </Button>
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            {t("apply")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
