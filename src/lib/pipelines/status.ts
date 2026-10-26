import type { Deal, DealDisplayStatus } from "@/types";

export function dealDisplayStatus(deal: Deal): DealDisplayStatus {
  if (deal.status === "won") return "won";
  if (deal.status === "lost") return "lost";
  if (deal.paused) return "paused";
  return "open";
}

export function dealMatchesStatusFilter(
  deal: Deal,
  filter: "all" | DealDisplayStatus | "not_paused",
): boolean {
  if (filter === "all") return true;
  if (filter === "not_paused") return !deal.paused && deal.status !== "won" && deal.status !== "lost";
  return dealDisplayStatus(deal) === filter;
}
