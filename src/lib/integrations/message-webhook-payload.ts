/**
 * Body posted to the account's message webhook.
 *
 * JSON posted when an inbound WhatsApp message arrives. The sample
 * capture also had transport fields (`headers`, `webhookUrl`,
 * `executionMode`); those belong to the receiver, so we send this object.
 */

export interface MessageWebhookContact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

export interface MessageWebhookDeal {
  id: string;
  status: string;
  stage_id: string | null;
  pipeline_id: string | null;
}

export interface MessageWebhookInput {
  accountId: string;
  channel: { id: string; name: string };
  contact: MessageWebhookContact;
  conversation: { id: string; status: string };
  deal: MessageWebhookDeal | null;
  message: {
    type: string;
    text: string;
    externalId: string | null;
    createdAt: string;
    mediaUrl: string | null;
  };
  tags: string[];
  customFields: Record<string, string>;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `Tue Sep 08 2026 20:48:29 GMT+0000 (Coordinated Universal Time)`. */
export function formatWebhookTimestamp(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    WEEKDAYS[date.getUTCDay()],
    MONTHS[date.getUTCMonth()],
    pad(date.getUTCDate()),
    date.getUTCFullYear(),
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
    "GMT+0000 (Coordinated Universal Time)",
  ].join(" ");
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function fieldKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function customValue(fields: Record<string, string>, key: string): string {
  for (const [name, value] of Object.entries(fields)) {
    if (fieldKey(name) === key) return value ?? "";
  }
  return "";
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildInboundMessageWebhookBody(input: MessageWebhookInput): Record<string, unknown> {
  const phone = digits(input.contact.phone);
  const name = input.contact.name?.trim() || phone || "Contato";
  const created = formatWebhookTimestamp(input.message.createdAt);
  const text = input.message.text ?? "";
  const media = input.message.mediaUrl?.trim() ? input.message.mediaUrl : null;
  const cpf = customValue(input.customFields, "cpf");
  const cep = customValue(input.customFields, "cep");
  const endereco = customValue(input.customFields, "endereco");
  const custom = { cep, cpf, endereco };
  const contact = {
    id: input.contact.id,
    name,
    phone,
    email: input.contact.email?.trim() ?? "",
    company: input.contact.company?.trim() ?? "",
    lead_code: customValue(input.customFields, "lead_code"),
    source: customValue(input.customFields, "source") || "whatsapp",
    utm_source: customValue(input.customFields, "utm_source"),
    utm_medium: customValue(input.customFields, "utm_medium"),
    utm_campaign: customValue(input.customFields, "utm_campaign"),
    utm_term: customValue(input.customFields, "utm_term"),
    utm_content: customValue(input.customFields, "utm_content"),
    ctwa_ad_id: customValue(input.customFields, "ctwa_ad_id"),
    ctwa_clid: customValue(input.customFields, "ctwa_clid"),
    cpf,
    cep,
    endereco,
  };
  const message = { text, media_url: media ?? "" };

  return {
    canal: {
      id: input.channel.id,
      nome: input.channel.name,
      tipo: "Channel::Whatsapp",
    },
    cliente: {
      id: input.contact.id,
      nome: name,
      telefone: phone,
      email: textOrNull(input.contact.email ?? ""),
      empresa: textOrNull(input.contact.company ?? ""),
      documento: textOrNull(customValue(input.customFields, "documento")),
      endereco: textOrNull(endereco),
      cep: textOrNull(cep),
    },
    mensagem: {
      tipo: input.message.type || "text",
      conteudo: text,
      direcao: "incoming",
      id_externo: input.message.externalId,
      criado_em: created,
      media_url: media,
      attachments: [],
    },
    account: { id: input.accountId },
    remetente: { tipo: "contact", nome: name, id: input.contact.id },
    conversa: { id: input.conversation.id, status: input.conversation.status },
    negociacao: input.deal
      ? {
          id: input.deal.id,
          status: input.deal.status,
          stage_id: input.deal.stage_id,
          pipeline_id: input.deal.pipeline_id,
        }
      : null,
    conversation: {
      id: input.conversation.id,
      conversation_id: input.conversation.id,
      status: input.conversation.status,
      messages: [
        {
          conversation_id: input.conversation.id,
          content: text,
          message_type: input.message.type || "text",
          created_at: created,
          attachments: [],
        },
      ],
    },
    tags: input.tags,
    origem: { sistema: "wacrm", evento: "new_message_received", teste: false },
    custom,
    vars: {},
    bruto: { contact, custom, message, vars: {} },
    contact,
    message,
  };
}
