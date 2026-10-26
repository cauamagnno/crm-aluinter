"use client";

import { Coins } from "lucide-react";

import { DEFAULT_CURRENCY } from "@/lib/currency";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { SettingsPanelHead } from "./settings-panel-head";

export function DealsSettings() {
  const t = useTranslations("Settings.deals");

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Coins className="size-4 text-primary" />
            {t("defaultCurrency")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t("defaultCurrencyDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground">
            {DEFAULT_CURRENCY} — {t("currencyName")}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
