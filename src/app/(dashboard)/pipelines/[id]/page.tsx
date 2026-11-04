"use client";

import { useParams } from "next/navigation";
import { OpportunityPage } from "@/components/pipelines/opportunity-page";

export default function OpportunityRoute() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  return <OpportunityPage dealId={id} />;
}
