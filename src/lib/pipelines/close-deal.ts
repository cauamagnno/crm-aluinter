import type { DealStatus } from "@/types";

/** Won and lost deals keep the moment they closed. Reopening clears it. */
export function dealStatusPatch(status: DealStatus): {
  status: DealStatus;
  closed_at: string | null;
} {
  if (status === "open") return { status, closed_at: null };
  return { status, closed_at: new Date().toISOString() };
}
