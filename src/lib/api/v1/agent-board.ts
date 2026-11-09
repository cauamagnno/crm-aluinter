// Board operations for the AI agent. Every call is keyed by the
// WhatsApp phone. `conversation_id` is used only when the inbound
// webhook already handed one over.
//
// The five routes share one response:
//   { ok: true, deal_id, conversation_id, stage }
//   { ok: false, error }

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireApiKey, type ApiKeyContext } from '@/lib/auth/api-context';
import { canOperateAgentBoard } from '@/lib/api-keys/scopes';
import { ApiError, forbidden } from '@/lib/api/v1/respond';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { isCompanyConflict, normalizeCompanyName } from '@/lib/contacts/dedupe';
import { ContactError } from '@/lib/api/v1/contacts';
import { DEFAULT_PIPELINE_NAME } from '@/lib/pipelines/default-stages';
import { resolveConversationByPhone } from '@/lib/whatsapp/resolve-conversation';
import { SendMessageError } from '@/lib/whatsapp/send-message';
import {
  isValidE164,
  phonesMatch,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';

export class AgentError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'AgentError';
    this.status = status;
  }
}

export const AGENT_STAGES = [
  'qualificacao',
  'oportunidade',
  'transferida',
  'resolvida',
] as const;

export type AgentStage = (typeof AGENT_STAGES)[number];

const STAGE_META: Record<
  AgentStage,
  { label: string; aliases: string[]; color: string }
> = {
  qualificacao: {
    label: 'Qualificação',
    aliases: ['qualificacao', 'qualificação'],
    color: '#0ea5e9',
  },
  oportunidade: {
    label: 'Oportunidade',
    aliases: ['oportunidade', 'levantamento de oportunidades'],
    color: '#8b5cf6',
  },
  transferida: {
    label: 'Transferida',
    aliases: ['transferida', 'transferido'],
    color: '#f97316',
  },
  resolvida: {
    label: 'Resolvida',
    aliases: ['resolvida', 'resolvido'],
    color: '#22c55e',
  },
};

export interface AgentResult {
  deal_id: string;
  conversation_id: string;
  stage: string;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  company: string | null;
  company_address: string | null;
}

interface ConversationRow {
  id: string;
  contact_id: string;
  status: string;
  assigned_agent_id: string | null;
}

interface DealRow {
  id: string;
  stage_id: string;
  notes: string | null;
  title: string;
  pipeline_id: string;
}

interface StageRow {
  id: string;
  name: string;
  position: number;
}

interface ProfileRow {
  id: string;
  user_id: string;
  account_role: string;
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseAgentStage(value: unknown): AgentStage {
  if (typeof value !== 'string') throw new AgentError('stage invalido');
  const folded = fold(value);
  const found = AGENT_STAGES.find((key) => {
    const meta = STAGE_META[key];
    return (
      fold(meta.label) === folded ||
      meta.aliases.some((alias) => fold(alias) === folded)
    );
  });
  if (!found) throw new AgentError('stage invalido');
  return found;
}

export function slugForStageName(name: string): string {
  const folded = fold(name);
  for (const key of AGENT_STAGES) {
    const meta = STAGE_META[key];
    if (
      fold(meta.label) === folded ||
      meta.aliases.some((alias) => fold(alias) === folded)
    ) {
      return key;
    }
  }
  return folded.replace(/ /g, '_');
}

export function pickRoundRobin<T extends { userId: string }>(
  members: readonly T[],
  openCounts: ReadonlyMap<string, number>,
): T | null {
  if (members.length === 0) return null;
  return [...members].sort((a, b) => {
    const load =
      (openCounts.get(a.userId) ?? 0) - (openCounts.get(b.userId) ?? 0);
    if (load !== 0) return load;
    return a.userId.localeCompare(b.userId);
  })[0];
}

export async function requireAgentBoard(
  request: Request,
): Promise<ApiKeyContext> {
  const ctx = await requireApiKey(request);
  if (!canOperateAgentBoard(ctx.scopes)) {
    throw forbidden("This API key is missing the 'deals:write' scope");
  }
  return ctx;
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AgentError('corpo invalido');
  }
  return body as Record<string, unknown>;
}

export function agentOk(result: AgentResult, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...result }, { status });
}

export function agentErrorResponse(err: unknown): NextResponse {
  if (err instanceof AgentError) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status },
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status, headers: err.headers },
    );
  }
  console.error('[api/v1/agent]', err);
  return NextResponse.json(
    { ok: false, error: 'erro interno' },
    { status: 500 },
  );
}

function textField(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!(key in body)) return undefined;
  if (typeof body[key] !== 'string') throw new AgentError(`${key} invalido`);
  const trimmed = body[key].trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requirePhone(body: Record<string, unknown>): string {
  const phone = textField(body, 'phone');
  if (!phone) throw new AgentError('telefone obrigatorio');
  const sanitized = sanitizePhoneForMeta(phone);
  if (!isValidE164(sanitized)) throw new AgentError('telefone invalido');
  return sanitized;
}

async function loadContact(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<ContactRow> {
  const { data, error } = await db
    .from('contacts')
    .select('id, phone, name, email, company, company_address')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle();
  if (error || !data) throw new AgentError('conversa nao encontrada', 404);
  return data as ContactRow;
}

async function resolveTarget(
  db: SupabaseClient,
  accountId: string,
  phone: string,
  conversationId: string | undefined,
): Promise<{ contact: ContactRow; conversation: ConversationRow }> {
  if (conversationId) {
    const { data, error } = await db
      .from('conversations')
      .select('id, contact_id, status, assigned_agent_id')
      .eq('account_id', accountId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error || !data) throw new AgentError('conversa nao encontrada', 404);
    const contact = await loadContact(db, accountId, data.contact_id);
    if (!phonesMatch(contact.phone, phone)) {
      throw new AgentError('conversa nao encontrada', 404);
    }
    return { contact, conversation: data as ConversationRow };
  }

  let resolved;
  try {
    resolved = await resolveConversationByPhone(db, accountId, phone);
  } catch (err) {
    if (err instanceof SendMessageError && err.code === 'bad_request') {
      throw new AgentError('telefone invalido');
    }
    if (err instanceof SendMessageError && err.code === 'whatsapp_not_configured') {
      throw new AgentError('whatsapp nao configurado', 400);
    }
    if (err instanceof SendMessageError && err.status < 500) {
      throw new AgentError('erro interno', err.status);
    }
    if (err instanceof ContactError) {
      throw new AgentError('erro interno', 500);
    }
    throw err;
  }
  const contact = await loadContact(db, accountId, resolved.contactId);
  const { data, error } = await db
    .from('conversations')
    .select('id, contact_id, status, assigned_agent_id')
    .eq('account_id', accountId)
    .eq('id', resolved.conversationId)
    .maybeSingle();
  if (error || !data) throw new AgentError('conversa nao encontrada', 404);
  return { contact, conversation: data as ConversationRow };
}

async function pipelineId(
  db: SupabaseClient,
  accountId: string,
): Promise<string> {
  const { data, error } = await db
    .from('pipelines')
    .select('id, name, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });
  if (error) throw new AgentError('erro interno', 500);
  const rows = (data ?? []) as { id: string; name: string }[];
  const named = rows.find(
    (row) => fold(row.name) === fold(DEFAULT_PIPELINE_NAME),
  );
  const pipeline = named ?? rows[0];
  if (!pipeline) throw new AgentError('pipeline nao encontrado', 404);
  return pipeline.id;
}

async function stageFor(
  db: SupabaseClient,
  pipeline: string,
  stage: AgentStage,
): Promise<StageRow> {
  const { data, error } = await db
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('pipeline_id', pipeline)
    .order('position', { ascending: true });
  if (error) throw new AgentError('erro interno', 500);
  const stages = (data ?? []) as StageRow[];
  const meta = STAGE_META[stage];
  const aliases = new Set(meta.aliases.map(fold));
  aliases.add(fold(meta.label));
  const existing = stages.find((row) => aliases.has(fold(row.name)));
  if (existing) return existing;

  const position =
    stages.reduce((max, row) => Math.max(max, row.position), -1) + 1;
  const { data: created, error: insertError } = await db
    .from('pipeline_stages')
    .insert({
      pipeline_id: pipeline,
      name: meta.label,
      color: meta.color,
      position,
    })
    .select('id, name, position')
    .single();
  if (insertError || !created) {
    const again = await db
      .from('pipeline_stages')
      .select('id, name, position')
      .eq('pipeline_id', pipeline);
    const raced = ((again.data ?? []) as StageRow[]).find((row) =>
      aliases.has(fold(row.name)),
    );
    if (raced) return raced;
    console.error('[api/v1/agent] stage create failed:', insertError);
    throw new AgentError('erro interno', 500);
  }
  return created as StageRow;
}

async function openDeal(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<DealRow | null> {
  const { data, error } = await db
    .from('deals')
    .select('id, stage_id, notes, title, pipeline_id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new AgentError('erro interno', 500);
  return ((data ?? [])[0] as DealRow | undefined) ?? null;
}

async function moveDeal(
  db: SupabaseClient,
  accountId: string,
  contact: ContactRow,
  conversationId: string,
  stage: AgentStage,
): Promise<DealRow> {
  const pipeline = await pipelineId(db, accountId);
  const column = await stageFor(db, pipeline, stage);
  const current = await openDeal(db, accountId, contact.id);
  if (current) {
    const { error } = await db
      .from('deals')
      .update({
        stage_id: column.id,
        pipeline_id: pipeline,
        conversation_id: conversationId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .eq('account_id', accountId);
    if (error) throw new AgentError('erro interno', 500);
    current.stage_id = column.id;
    current.pipeline_id = pipeline;
    return current;
  }

  const userId = await resolveAuditUserId(db, accountId);
  const { data: account } = await db
    .from('accounts')
    .select('default_currency')
    .eq('id', accountId)
    .maybeSingle();
  const title = contact.company?.trim() || contact.name?.trim() || contact.phone;
  const { data, error } = await db
    .from('deals')
    .insert({
      account_id: accountId,
      user_id: userId,
      pipeline_id: pipeline,
      stage_id: column.id,
      contact_id: contact.id,
      conversation_id: conversationId,
      title,
      value: 0,
      currency:
        (account as { default_currency?: string } | null)?.default_currency ??
        'USD',
      status: 'open',
    })
    .select('id, stage_id, notes, title, pipeline_id')
    .single();
  if (error || !data) {
    console.error('[api/v1/agent] deal create failed:', error);
    throw new AgentError('erro interno', 500);
  }
  return data as DealRow;
}

async function ensureOpenDeal(
  db: SupabaseClient,
  accountId: string,
  contact: ContactRow,
  conversationId: string,
): Promise<DealRow> {
  const current = await openDeal(db, accountId, contact.id);
  if (current) {
    if (current.pipeline_id) {
      await db
        .from('deals')
        .update({
          conversation_id: conversationId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', current.id)
        .eq('account_id', accountId);
    }
    return current;
  }
  return moveDeal(db, accountId, contact, conversationId, 'qualificacao');
}

async function currentStageSlug(
  db: SupabaseClient,
  stageId: string,
): Promise<string> {
  const { data } = await db
    .from('pipeline_stages')
    .select('name')
    .eq('id', stageId)
    .maybeSingle();
  return slugForStageName((data as { name?: string } | null)?.name ?? '');
}

async function appendInternal(
  db: SupabaseClient,
  accountId: string,
  dealId: string,
  message: string,
) {
  const { data } = await db
    .from('deals')
    .select('notes')
    .eq('id', dealId)
    .eq('account_id', accountId)
    .maybeSingle();
  const previous = ((data as { notes?: string | null } | null)?.notes ?? '').trim();
  const notes = previous ? `${previous}\n\n${message}` : message;
  const { error } = await db
    .from('deals')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('account_id', accountId);
  if (error) throw new AgentError('erro interno', 500);
  await note(db, accountId, dealId, message);
}

async function note(
  db: SupabaseClient,
  accountId: string,
  dealId: string,
  message: string,
) {
  const userId = await resolveAuditUserId(db, accountId);
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('account_id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  await db.from('deal_events').insert({
    account_id: accountId,
    deal_id: dealId,
    actor_id: (profile as { id: string } | null)?.id ?? null,
    kind: 'note',
    message,
  });
}

async function rememberCustom(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  fieldName: string,
  value: string,
) {
  const userId = await resolveAuditUserId(db, accountId);
  const { data: existing } = await db
    .from('custom_fields')
    .select('id, field_name')
    .eq('account_id', accountId);
  const found = ((existing ?? []) as { id: string; field_name: string }[]).find(
    (field) => fold(field.field_name) === fold(fieldName),
  );
  let fieldId = found?.id;
  if (!fieldId) {
    const { data: created, error } = await db
      .from('custom_fields')
      .insert({
        account_id: accountId,
        user_id: userId,
        field_name: fieldName,
        field_type: 'text',
      })
      .select('id')
      .single();
    if (error || !created) {
      console.error('[api/v1/agent] custom field failed:', error);
      throw new AgentError('erro interno', 500);
    }
    fieldId = (created as { id: string }).id;
  }
  const { error } = await db.from('contact_custom_values').upsert(
    { contact_id: contactId, custom_field_id: fieldId, value },
    { onConflict: 'contact_id,custom_field_id' },
  );
  if (error) {
    console.error('[api/v1/agent] custom value failed:', error);
    throw new AgentError('erro interno', 500);
  }
}

function resultOf(dealId: string, conversationId: string, stage: AgentStage): AgentResult {
  return { deal_id: dealId, conversation_id: conversationId, stage };
}

export async function moveDealStage(
  db: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<AgentResult> {
  const phone = requirePhone(body);
  const stage = parseAgentStage(body.stage);
  const conversationId = textField(body, 'conversation_id');
  const target = await resolveTarget(db, accountId, phone, conversationId);
  const deal = await moveDeal(
    db,
    accountId,
    target.contact,
    target.conversation.id,
    stage,
  );
  return resultOf(deal.id, target.conversation.id, stage);
}

export async function updateOpenDeal(
  db: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<AgentResult> {
  const phone = requirePhone(body);
  const empresa = textField(body, 'empresa');
  const cnpj = textField(body, 'cnpj');
  const cidade = textField(body, 'cidade');
  const email = textField(body, 'email');
  const target = await resolveTarget(
    db,
    accountId,
    phone,
    textField(body, 'conversation_id'),
  );
  const deal = await ensureOpenDeal(
    db,
    accountId,
    target.contact,
    target.conversation.id,
  );

  const contactPatch: Record<string, string> = {};
  if (empresa) {
    contactPatch.company = empresa;
    contactPatch.company_normalized = normalizeCompanyName(empresa);
  }
  if (email) contactPatch.email = email;
  if (cidade) contactPatch.company_address = cidade;
  if (Object.keys(contactPatch).length > 0) {
    const { error } = await db
      .from('contacts')
      .update({ ...contactPatch, updated_at: new Date().toISOString() })
      .eq('id', target.contact.id)
      .eq('account_id', accountId);
    if (isCompanyConflict(error)) throw new AgentError('empresa ja cadastrada', 409);
    if (error) throw new AgentError('erro interno', 500);
  }
  if (cnpj) {
    await rememberCustom(db, accountId, target.contact.id, 'CNPJ', cnpj);
  }

  if (empresa && empresa !== deal.title) {
    const { error } = await db
      .from('deals')
      .update({ title: empresa, updated_at: new Date().toISOString() })
      .eq('id', deal.id)
      .eq('account_id', accountId);
    if (error) throw new AgentError('erro interno', 500);
  }

  return {
    deal_id: deal.id,
    conversation_id: target.conversation.id,
    stage: await currentStageSlug(db, deal.stage_id),
  };
}

export async function writeDealSummary(
  db: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<AgentResult> {
  const phone = requirePhone(body);
  const resumo = textField(body, 'resumo');
  if (!resumo) throw new AgentError('resumo obrigatorio');
  const target = await resolveTarget(
    db,
    accountId,
    phone,
    textField(body, 'conversation_id'),
  );
  const deal = await ensureOpenDeal(
    db,
    accountId,
    target.contact,
    target.conversation.id,
  );
  const { error } = await db
    .from('deals')
    .update({ notes: resumo, updated_at: new Date().toISOString() })
    .eq('id', deal.id)
    .eq('account_id', accountId);
  if (error) throw new AgentError('erro interno', 500);
  await note(db, accountId, deal.id, resumo);
  return {
    deal_id: deal.id,
    conversation_id: target.conversation.id,
    stage: await currentStageSlug(db, deal.stage_id),
  };
}

async function comercialPool(
  db: SupabaseClient,
  accountId: string,
): Promise<ProfileRow[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, user_id, account_role')
    .eq('account_id', accountId);
  if (error) throw new AgentError('erro interno', 500);
  const rows = ((data ?? []) as ProfileRow[]).filter((row) => row.user_id);
  const sellers = rows.filter((row) => row.account_role === 'agent');
  return sellers.length > 0
    ? sellers
    : rows.filter((row) => row.account_role !== 'viewer');
}

export async function assignConversation(
  db: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<AgentResult> {
  const phone = requirePhone(body);
  const time = textField(body, 'time') ?? 'comercial';
  if (fold(time) !== 'comercial') throw new AgentError('time nao encontrado');
  const motivo = textField(body, 'motivo');
  const target = await resolveTarget(
    db,
    accountId,
    phone,
    textField(body, 'conversation_id'),
  );
  const pool = await comercialPool(db, accountId);
  if (pool.length === 0) throw new AgentError('time comercial sem usuarios', 409);

  const { data: openRows } = await db
    .from('conversations')
    .select('assigned_agent_id')
    .eq('account_id', accountId)
    .eq('status', 'open')
    .in(
      'assigned_agent_id',
      pool.map((member) => member.user_id),
    );
  const counts = new Map<string, number>();
  for (const row of (openRows ?? []) as { assigned_agent_id: string | null }[]) {
    if (!row.assigned_agent_id) continue;
    counts.set(row.assigned_agent_id, (counts.get(row.assigned_agent_id) ?? 0) + 1);
  }
  const chosen = pickRoundRobin(
    pool.map((member) => ({ userId: member.user_id, profileId: member.id })),
    counts,
  );
  if (!chosen) throw new AgentError('time comercial sem usuarios', 409);

  const { error: assignError } = await db
    .from('conversations')
    .update({
      assigned_agent_id: chosen.userId,
      status: 'open',
      ai_autoreply_disabled: true,
      ai_handoff_summary: motivo ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.conversation.id)
    .eq('account_id', accountId);
  if (assignError) throw new AgentError('erro interno', 500);

  const deal = await moveDeal(
    db,
    accountId,
    target.contact,
    target.conversation.id,
    'transferida',
  );
  const { error: dealError } = await db
    .from('deals')
    .update({
      assigned_to: chosen.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deal.id)
    .eq('account_id', accountId);
  if (dealError) throw new AgentError('erro interno', 500);
  await db
    .from('contacts')
    .update({ assigned_to: chosen.profileId, updated_at: new Date().toISOString() })
    .eq('id', target.contact.id)
    .eq('account_id', accountId);
  if (motivo) await appendInternal(db, accountId, deal.id, motivo);

  return resultOf(deal.id, target.conversation.id, 'transferida');
}

export async function resolveConversation(
  db: SupabaseClient,
  accountId: string,
  body: Record<string, unknown>,
): Promise<AgentResult> {
  const phone = requirePhone(body);
  const motivo = textField(body, 'motivo');
  const target = await resolveTarget(
    db,
    accountId,
    phone,
    textField(body, 'conversation_id'),
  );
  const { error } = await db
    .from('conversations')
    .update({
      status: 'closed',
      ai_autoreply_disabled: true,
      ai_handoff_summary: motivo ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.conversation.id)
    .eq('account_id', accountId);
  if (error) throw new AgentError('erro interno', 500);

  const deal = await moveDeal(
    db,
    accountId,
    target.contact,
    target.conversation.id,
    'resolvida',
  );
  if (motivo) await appendInternal(db, accountId, deal.id, motivo);
  return resultOf(deal.id, target.conversation.id, 'resolvida');
}
