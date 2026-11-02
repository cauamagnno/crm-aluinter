import type { SupabaseClient } from "@/lib/db/types";
import type { DashboardPeriod } from "./period";

export interface SalesReport {
  created: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  /** Won value divided by won count. Null when there are no wins. */
  ticket: number | null;
}

type DealValueRow = { id: string; value: number | null };

/**
 * Sales figures for a period.
 * Created deals use created_at. Wins and losses use closed_at.
 * Pass assignedTo (profiles.id) to limit the sum to one vendor.
 * RLS still hides deals the caller cannot see.
 */
export async function loadSalesReport(
  db: SupabaseClient,
  period: DashboardPeriod,
  assignedTo?: string,
): Promise<SalesReport> {
  const start = period.start.toISOString();
  const end = period.end.toISOString();

  let createdQuery = db
    .from("deals")
    .select("id")
    .gte("created_at", start)
    .lt("created_at", end);
  let wonQuery = db
    .from("deals")
    .select("id, value")
    .eq("status", "won")
    .gte("closed_at", start)
    .lt("closed_at", end);
  let lostQuery = db
    .from("deals")
    .select("id, value")
    .eq("status", "lost")
    .gte("closed_at", start)
    .lt("closed_at", end);

  if (assignedTo) {
    createdQuery = createdQuery.eq("assigned_to", assignedTo);
    wonQuery = wonQuery.eq("assigned_to", assignedTo);
    lostQuery = lostQuery.eq("assigned_to", assignedTo);
  }

  const [createdRes, wonRes, lostRes] = await Promise.all([
    createdQuery,
    wonQuery,
    lostQuery,
  ]);

  if (createdRes.error) throw createdRes.error;
  if (wonRes.error) throw wonRes.error;
  if (lostRes.error) throw lostRes.error;

  const won = (wonRes.data ?? []) as DealValueRow[];
  const lost = (lostRes.data ?? []) as DealValueRow[];
  const wonValue = won.reduce((sum, row) => sum + Number(row.value ?? 0), 0);
  const lostValue = lost.reduce((sum, row) => sum + Number(row.value ?? 0), 0);

  return {
    created: ((createdRes.data ?? []) as { id: string }[]).length,
    wonCount: won.length,
    wonValue,
    lostCount: lost.length,
    lostValue,
    ticket: won.length > 0 ? wonValue / won.length : null,
  };
}
