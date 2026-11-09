import { describe, expect, it } from "vitest";

import {
  buildInboundMessageWebhookBody,
  formatWebhookTimestamp,
} from "./message-webhook-payload";

const input = {
  accountId: "6fe1b6eb-5361-4a88-8dc8-b2e98e164039",
  channel: { id: "a3be2073-961f-4f94-95a5-2f9f67f8b70a", name: "WhatsApp" },
  contact: {
    id: "6a809706-0f86-4026-8ee2-3e5a4ce09322",
    name: "Dani",
    phone: "+55 (83) 87668-279",
    email: null,
    company: null,
  },
  conversation: { id: "f562be83-a6b1-45a7-b864-3a844f0fe2f9", status: "open" },
  deal: {
    id: "671496d1-46c6-4af7-b3d1-ea3177228056",
    status: "open",
    stage_id: "b2e25460-79e4-432c-ba76-5583a8535ace",
    pipeline_id: "23a5dd2f-764f-46d5-a72b-44524f0ebfa9",
  },
  message: {
    type: "interactive",
    text: "Continuar atendimento",
    externalId: "wamid.abc",
    createdAt: "2026-09-08T20:48:29.000Z",
    mediaUrl: null,
  },
  tags: ["ia_atendendo"],
  customFields: {
    CPF: "123",
    CEP: "58000-000",
    Endereço: "Rua A",
    lead_code: "294",
    utm_source: "meta_ads",
  },
};

describe("inbound message webhook body", () => {
  it("formats the timestamp the way the sample stored it", () => {
    expect(formatWebhookTimestamp("2026-09-08T20:48:29.000Z")).toBe(
      "Tue Sep 08 2026 20:48:29 GMT+0000 (Coordinated Universal Time)",
    );
  });

  it("builds the message JSON, without the capture wrapper", () => {
    const body = buildInboundMessageWebhookBody(input);

    expect(body).not.toHaveProperty("headers");
    expect(body).not.toHaveProperty("webhookUrl");
    expect(body.origem).toEqual({
      sistema: "wacrm",
      evento: "new_message_received",
      teste: false,
    });
    expect(body.cliente).toMatchObject({
      nome: "Dani",
      telefone: "558387668279",
      email: null,
      empresa: null,
      documento: null,
      endereco: "Rua A",
      cep: "58000-000",
    });
    expect(body.mensagem).toMatchObject({
      tipo: "interactive",
      conteudo: "Continuar atendimento",
      direcao: "incoming",
      id_externo: "wamid.abc",
      media_url: null,
      attachments: [],
    });
    expect(body.negociacao).toMatchObject({ status: "open" });
    expect(body.tags).toEqual(["ia_atendendo"]);
    expect(body.custom).toEqual({ cep: "58000-000", cpf: "123", endereco: "Rua A" });
    expect(body.contact).toMatchObject({
      phone: "558387668279",
      lead_code: "294",
      source: "whatsapp",
      utm_source: "meta_ads",
      cpf: "123",
    });
    expect(body.message).toEqual({ text: "Continuar atendimento", media_url: "" });
    expect(body.bruto).toMatchObject({
      contact: body.contact,
      message: body.message,
    });
  });

  it("leaves the deal null when the contact has none", () => {
    const body = buildInboundMessageWebhookBody({ ...input, deal: null });
    expect(body.negociacao).toBeNull();
  });
});
