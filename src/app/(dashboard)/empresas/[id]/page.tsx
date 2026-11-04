"use client";

import { useParams } from "next/navigation";
import { CompanyDetail } from "@/components/companies/company-detail";

export default function EmpresaPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  return <CompanyDetail contactId={id} />;
}
