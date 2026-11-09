import {
  agentErrorResponse,
  agentOk,
  readJson,
  requireAgentBoard,
  writeDealSummary,
} from '@/lib/api/v1/agent-board';

export async function POST(request: Request) {
  try {
    const ctx = await requireAgentBoard(request);
    const body = await readJson(request);
    return agentOk(await writeDealSummary(ctx.supabase, ctx.accountId, body));
  } catch (err) {
    return agentErrorResponse(err);
  }
}
