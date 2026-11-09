import type { SupabaseClient } from "@supabase/supabase-js";

import { isDeliverableUrl } from "@/lib/webhooks/ssrf";
import { DELIVERY_TIMEOUT_MS } from "@/lib/webhooks/deliver";
import {
  buildInboundMessageWebhookBody,
  type MessageWebhookDeal,
} from "@/lib/integrations/message-webhook-payload";

export interface InboundMessageWebhookEvent {
  accountId: string;
  contactId: string;
  conversationId: string;
  externalId: string | null;
  contentType: string;
  text: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

/**
 * POST the inbound message to the account webhook when the Integrações
 * toggle is on. Best-effort: never throws, so a dead URL cannot
 * make Meta retry the WhatsApp webhook.
 */
export async function dispatchInboundMessageWebhook(
  db: SupabaseClient,
  event: InboundMessageWebhookEvent,
): Promise<void> {
  try {
    const { data: config, error } = await db
      .from("account_message_webhooks")
      .select("url, enabled")
      .eq("account_id", event.accountId)
      .maybeSingle();

    if (error || !config?.enabled || !config.url) return;
    if (!(await isDeliverableUrl(config.url))) {
      console.warn("[integrations] refusing message webhook target for", event.accountId);
      return;
    }

    const [contactRes, conversationRes, dealsRes, tagsRes, valuesRes, channelRes] = await Promise.all([
      db
        .from("contacts")
        .select("id, name, phone, email, company")
        .eq("id", event.contactId)
        .maybeSingle(),
      db
        .from("conversations")
        .select("id, status")
        .eq("id", event.conversationId)
        .maybeSingle(),
      db
        .from("deals")
        .select("id, status, stage_id, pipeline_id, updated_at")
        .eq("contact_id", event.contactId)
        .order("updated_at", { ascending: false })
        .limit(20),
      db.from("contact_tags").select("tag:tags(name)").eq("contact_id", event.contactId),
      db
        .from("contact_custom_values")
        .select("value, field:custom_fields(field_name)")
        .eq("contact_id", event.contactId),
      db
        .from("whatsapp_config")
        .select("id")
        .eq("account_id", event.accountId)
        .limit(1)
        .maybeSingle(),
    ]);

    const contact = contactRes.data;
    const conversation = conversationRes.data;
    if (!contact || !conversation) return;

    const body = JSON.stringify(
      buildInboundMessageWebhookBody({
        accountId: event.accountId,
        channel: {
          id: channelRes.data?.id ?? event.accountId,
          name: "WhatsApp",
        },
        contact,
        conversation,
        deal: pickDeal(dealsRes.data ?? []),
        message: {
          type: event.contentType || "text",
          text: event.text ?? "",
          externalId: event.externalId,
          createdAt: event.createdAt,
          mediaUrl: event.mediaUrl,
        },
        tags: tagNames(tagsRes.data ?? []),
        customFields: customFieldMap(valuesRes.data ?? []),
      }),
    );

    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[integrations] message webhook responded", res.status);
    }
  } catch (err) {
    console.warn(
      "[integrations] message webhook failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

function pickDeal(
  rows: { id: string; status: string; stage_id: string | null; pipeline_id: string | null }[],
): MessageWebhookDeal | null {
  const open = rows.find((row) => row.status === "open");
  const deal = open ?? rows[0];
  if (!deal) return null;
  return {
    id: deal.id,
    status: deal.status,
    stage_id: deal.stage_id,
    pipeline_id: deal.pipeline_id,
  };
}

function tagNames(rows: unknown[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    const tag = (row as { tag?: { name?: string } | { name?: string }[] | null }).tag;
    const name = Array.isArray(tag) ? tag[0]?.name : tag?.name;
    if (name) names.push(name);
  }
  return names;
}

function customFieldMap(rows: unknown[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const row of rows) {
    const value = (row as { value?: string | null }).value ?? "";
    const field = (row as { field?: { field_name?: string } | { field_name?: string }[] | null }).field;
    const name = Array.isArray(field) ? field[0]?.field_name : field?.field_name;
    if (name) fields[name] = value;
  }
  return fields;
}
