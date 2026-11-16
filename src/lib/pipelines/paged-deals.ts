import { fromDateInputValue, startOfNextLocalDay } from "@/lib/dashboard/date-utils";

export type DealStatusFilter = "all" | "open" | "won" | "lost" | "paused" | "not_paused";
export type DealSort = "created_desc" | "created_asc" | "value_desc";

/** Columns the board needs before the task lookup. Contact is embedded so the company shows on the first paint. */
export const DEAL_PAGE_COLUMNS =
  "id, pipeline_id, stage_id, title, value, currency, status, paused, assigned_to, created_at, updated_at, expected_close_date, closed_at, contact_id, lost_reason, contact:contacts(id, name, company)";

/** Light rows for column totals and the forecast bar. No contact join. */
export const DEAL_STAT_COLUMNS = "id, stage_id, value, status, closed_at";

type Filterable = {
  eq(column: string, value: unknown): Filterable;
  gte(column: string, value: unknown): Filterable;
  lte(column: string, value: unknown): Filterable;
  lt(column: string, value: unknown): Filterable;
  or(raw: string): Filterable;
  order(column: string, opts?: { ascending?: boolean }): Filterable;
};

export interface DealPageQuery {
  pipelineId: string;
  stageId?: string;
  seesAllDeals: boolean;
  profileId?: string;
  ownerId: string;
  status: DealStatusFilter;
  valueMin: string;
  valueMax: string;
  createdFrom: string;
  createdTo: string;
  closedFrom: string;
  closedTo: string;
  closeFrom: string;
  /** PostgREST or() clause, or empty when there is no text search. */
  searchOr: string;
  sort: DealSort;
}

function dayStart(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return fromDateInputValue(day).toISOString();
}

function dayEnd(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return startOfNextLocalDay(fromDateInputValue(day)).toISOString();
}

/**
 * Applies the board filters in SQL so each column can ask for one page
 * instead of downloading every deal.
 */
export function applyDealPageFilters<T extends Filterable>(query: T, filters: DealPageQuery): T {
  let next: Filterable = query.eq("pipeline_id", filters.pipelineId);
  if (!filters.seesAllDeals && filters.profileId) {
    next = next.or(`assigned_to.eq.${filters.profileId},status.in.(won,lost)`);
  }
  if (filters.ownerId !== "all") next = next.eq("assigned_to", filters.ownerId);
  if (filters.stageId) next = next.eq("stage_id", filters.stageId);
  if (filters.status === "won" || filters.status === "lost") {
    next = next.eq("status", filters.status);
  } else if (filters.status === "open" || filters.status === "not_paused") {
    next = next.eq("status", "open").eq("paused", false);
  } else if (filters.status === "paused") {
    next = next.eq("status", "open").eq("paused", true);
  }
  const min = filters.valueMin ? Number(filters.valueMin) : null;
  const max = filters.valueMax ? Number(filters.valueMax) : null;
  if (min != null && !Number.isNaN(min)) next = next.gte("value", min);
  if (max != null && !Number.isNaN(max)) next = next.lte("value", max);
  const createdFrom = dayStart(filters.createdFrom);
  const createdTo = dayEnd(filters.createdTo);
  if (createdFrom) next = next.gte("created_at", createdFrom);
  if (createdTo) next = next.lt("created_at", createdTo);
  const closedFrom = dayStart(filters.closedFrom);
  const closedTo = dayEnd(filters.closedTo);
  if (closedFrom) next = next.gte("closed_at", closedFrom);
  if (closedTo) next = next.lt("closed_at", closedTo);
  if (/^\d{4}-\d{2}-\d{2}$/.test(filters.closeFrom)) {
    next = next.gte("expected_close_date", filters.closeFrom);
  }
  if (filters.searchOr) next = next.or(filters.searchOr);
  if (filters.sort === "value_desc") next = next.order("value", { ascending: false });
  else if (filters.sort === "created_asc") next = next.order("created_at", { ascending: true });
  else next = next.order("created_at", { ascending: false });
  return next as T;
}

/** or() values cannot contain commas or parentheses; those split the clause. */
export function dealSearchOr(raw: string, contactIds: string[]): string {
  const token = raw.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!token) return "";
  const title = `title.ilike.%${token}%`;
  if (contactIds.length === 0) return title;
  return `${title},contact_id.in.(${contactIds.join(",")})`;
}
