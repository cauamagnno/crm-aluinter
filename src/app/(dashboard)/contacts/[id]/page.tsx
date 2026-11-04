"use client";

import { useParams } from "next/navigation";
import { ContactDetailView } from "@/components/contacts/contact-detail-view";

export default function ContactCardPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  return (
    <ContactDetailView
      asPage
      open
      onOpenChange={() => undefined}
      contactId={id || null}
      initialTab="overview"
      onUpdated={() => undefined}
    />
  );
}
