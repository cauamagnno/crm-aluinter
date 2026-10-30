"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Deal, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export function DealTaskForm({
  open,
  onOpenChange,
  deal,
  deals,
  profiles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
  deals: Deal[];
  profiles: Profile[];
  onSaved: () => void;
}) {
  const t = useTranslations("Pipelines.tasks");
  const supabase = createClient();
  const { accountId, user, profile } = useAuth();

  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("09:00");
  const [markDone, setMarkDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const selected = deal ?? deals[0] ?? null;
    setDealId(selected?.id ?? "");
    setTitle("");
    setDescription("");
    setAssigneeId(profile?.id ?? selected?.assigned_to ?? "");
    const now = new Date();
    setDueDate(now.toISOString().slice(0, 10));
    setDueTime(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
    setMarkDone(false);
  }, [open, deal, deals, profile?.id]);

  const selectedDeal = deals.find((d) => d.id === dealId) ?? deal;
  const contactSource =
    selectedDeal?.contact ? selectedDeal : dealId === deal?.id ? deal : selectedDeal;
  const company =
    contactSource?.contact?.name || contactSource?.contact?.phone || "—";

  async function handleSave() {
    if (!title.trim() || !assigneeId || !dueDate || !dealId) {
      toast.error(t("required"));
      return;
    }
    if (!accountId || !user) return;
    setSaving(true);
    const dueAt = new Date(`${dueDate}T${dueTime || "09:00"}:00`);
    const { error } = await supabase.from("deal_tasks").insert({
      account_id: accountId,
      deal_id: dealId,
      title: title.trim(),
      description: description.trim() || null,
      assignee_id: assigneeId,
      due_at: dueAt.toISOString(),
      kind: "tarefa",
      created_by: user.id,
      done_at: markDone ? new Date().toISOString() : null,
    });
    setSaving(false);
    if (error) {
      toast.error(t("failed"));
      return;
    }
    toast.success(t("created"));
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-border bg-popover p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{t("title")}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-1.5">
            <Label>{t("company")}</Label>
            <Input value={company} readOnly className="bg-muted" />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("deal")} *</Label>
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm"
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("subject")} *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("subjectPlaceholder")}
              className="bg-muted"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("description")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className="min-h-20 bg-muted"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("assignee")} *</Label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm"
            >
              <option value="">—</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t("kind")} *</Label>
            <Input value={t("kindTask")} readOnly className="bg-muted" />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("dueDate")} *</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-muted"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("dueTime")} *</Label>
            <Input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="bg-muted"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markDone}
              onChange={(e) => setMarkDone(e.target.checked)}
              className="size-4 accent-primary"
            />
            {t("markDone")}
          </label>
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
