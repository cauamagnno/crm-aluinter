import type { SupabaseClient } from "@/lib/db/types";
import type { DashboardPeriod } from "./period";

export const TASK_KINDS = ["ligacao", "whatsapp", "email"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export interface TaskActivity {
  ligacao: number;
  whatsapp: number;
  email: number;
}

/**
 * Completed tasks in the period, split by kind.
 * A task counts when deal_tasks.done_at falls in the interval and kind is
 * ligacao, whatsapp, or email. Older rows stored as "tarefa" stay out.
 * RLS decides which tasks the caller can see. The tarefas page, opened
 * with the same dates and scope=visible, lists these same rows.
 */
export async function loadTaskActivity(
  db: SupabaseClient,
  period: DashboardPeriod,
  assigneeId?: string,
): Promise<TaskActivity> {
  let query = db
    .from("deal_tasks")
    .select("kind")
    .in("kind", [...TASK_KINDS])
    .gte("done_at", period.start.toISOString())
    .lt("done_at", period.end.toISOString());
  if (assigneeId) query = query.eq("assignee_id", assigneeId);
  const { data, error } = await query;

  if (error) throw error;

  const counts: TaskActivity = { ligacao: 0, whatsapp: 0, email: 0 };
  for (const row of (data ?? []) as { kind: string }[]) {
    if (row.kind === "ligacao" || row.kind === "whatsapp" || row.kind === "email") {
      counts[row.kind] += 1;
    }
  }
  return counts;
}
