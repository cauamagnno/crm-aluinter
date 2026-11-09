"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { normalizeWebhookUrl } from "@/lib/webhooks/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

export function IntegrationsSettings() {
  const t = useTranslations("Settings.integrations");
  const { accountId, canEditSettings } = useAuth();
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const db = createClient();
    void db
      .from("account_message_webhooks")
      .select("url, enabled")
      .eq("account_id", accountId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(t("loadFailed"));
        } else if (data) {
          setUrl(data.url ?? "");
          setEnabled(Boolean(data.enabled));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, t]);

  async function save() {
    if (!accountId || !canEditSettings) return;
    const trimmed = url.trim();
    const normalized = trimmed ? normalizeWebhookUrl(trimmed) : null;
    if (enabled && !normalized) {
      toast.error(t("invalidUrl"));
      return;
    }
    if (trimmed && !normalized) {
      toast.error(t("invalidUrl"));
      return;
    }

    setSaving(true);
    const db = createClient();
    const { error } = await db.from("account_message_webhooks").upsert(
      {
        account_id: accountId,
        url: normalized,
        enabled: enabled && Boolean(normalized),
      },
      { onConflict: "account_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(t("saveFailed"));
      return;
    }
    setUrl(normalized ?? "");
    toast.success(t("saveSuccess"));
  }

  return (
    <section>
      <SettingsPanelHead title={t("title")} description={t("description")} />
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-1.5">
            <Label htmlFor="message-webhook-url">{t("urlLabel")}</Label>
            <Input
              id="message-webhook-url"
              type="url"
              inputMode="url"
              placeholder="https://exemplo.com/webhook/crm"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loading || !canEditSettings}
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">{t("urlHint")}</p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="message-webhook-when">{t("whenLabel")}</Label>
            <select
              id="message-webhook-when"
              value={enabled ? "inbound" : "off"}
              onChange={(event) => setEnabled(event.target.value === "inbound")}
              disabled={loading || !canEditSettings}
              className="h-8 w-full rounded-lg border border-input bg-muted px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="off">{t("whenOff")}</option>
              <option value="inbound">{t("whenInbound")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{t("whenHint")}</p>
          </div>

          {canEditSettings ? (
            <div>
              <Button type="button" onClick={() => void save()} disabled={loading || saving}>
                {saving ? t("saving") : t("save")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
