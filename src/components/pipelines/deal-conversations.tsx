"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ClipboardPaste, Loader2, Pencil, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { hasMinRole } from "@/lib/auth/roles";
import { formatDateTimePt } from "@/lib/pt-format";
import type { Deal, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PastedConversation = {
  id: string;
  title: string;
  body: string;
  author_id: string | null;
  created_at: string;
};

type WhatsappConversation = {
  id: string;
  status: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

type WhatsappMessage = {
  id: string;
  conversation_id: string;
  sender_type: string;
  content_type: string;
  content_text: string | null;
  created_at: string;
};

const MESSAGES_PER_CONVERSATION = 30;

/**
 * History tab block of a deal: conversations pasted by the sellers, and the
 * WhatsApp conversations of the deal's contact (every member can read them).
 */
export function DealConversations({
  deal,
  profiles,
}: {
  deal: Deal;
  profiles: Profile[];
}) {
  const t = useTranslations("Pipelines.conversations");
  const supabase = createClient();
  const { accountRole, profile } = useAuth();

  const [pasted, setPasted] = useState<PastedConversation[]>([]);
  const [whatsapp, setWhatsapp] = useState<WhatsappConversation[]>([]);
  const [messages, setMessages] = useState<Record<string, WhatsappMessage[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PastedConversation | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [saving, setSaving] = useState(false);

  const isManager = accountRole ? hasMinRole(accountRole, "gestor") : false;
  const canChange = (row: PastedConversation) =>
    isManager || (row.author_id !== null && row.author_id === profile?.id);

  const load = useCallback(async () => {
    setLoading(true);
    const pastedRes = await supabase
      .from("deal_conversations")
      .select("id, title, body, author_id, created_at")
      .eq("deal_id", deal.id)
      .order("created_at", { ascending: false });
    setPasted((pastedRes.data as PastedConversation[]) ?? []);

    if (deal.contact_id) {
      const convRes = await supabase
        .from("conversations")
        .select("id, status, last_message_text, last_message_at")
        .eq("contact_id", deal.contact_id)
        .order("last_message_at", { ascending: false });
      const convs = (convRes.data as WhatsappConversation[]) ?? [];
      setWhatsapp(convs);

      if (convs.length > 0) {
        const msgRes = await supabase
          .from("messages")
          .select("id, conversation_id, sender_type, content_type, content_text, created_at")
          .in(
            "conversation_id",
            convs.map((c) => c.id),
          )
          .order("created_at", { ascending: false })
          .limit(MESSAGES_PER_CONVERSATION * convs.length);
        const grouped: Record<string, WhatsappMessage[]> = {};
        for (const row of (msgRes.data as WhatsappMessage[]) ?? []) {
          const list = grouped[row.conversation_id] ?? [];
          if (list.length < MESSAGES_PER_CONVERSATION) list.push(row);
          grouped[row.conversation_id] = list;
        }
        for (const list of Object.values(grouped)) list.reverse();
        setMessages(grouped);
      } else {
        setMessages({});
      }
    } else {
      setWhatsapp([]);
      setMessages({});
    }
    setLoading(false);
  }, [deal.id, deal.contact_id, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setDraftTitle("");
    setDraftBody("");
    setDialogOpen(true);
  }

  function openEdit(row: PastedConversation) {
    setEditing(row);
    setDraftTitle(row.title);
    setDraftBody(row.body);
    setDialogOpen(true);
  }

  async function save() {
    const body = draftBody.trim();
    if (!body) {
      toast.error(t("requiredBody"));
      return;
    }
    setSaving(true);
    const title = draftTitle.trim();
    const { error } = editing
      ? await supabase
          .from("deal_conversations")
          .update({ title, body })
          .eq("id", editing.id)
      : await supabase.from("deal_conversations").insert({
          account_id: deal.account_id,
          deal_id: deal.id,
          contact_id: deal.contact_id,
          author_id: profile?.id ?? null,
          title,
          body,
        });
    setSaving(false);
    if (error) {
      toast.error(t("failed"));
      return;
    }
    toast.success(editing ? t("updated") : t("saved"));
    setDialogOpen(false);
    void load();
  }

  async function remove(row: PastedConversation) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const { error } = await supabase.from("deal_conversations").delete().eq("id", row.id);
    if (error) {
      toast.error(t("deleteFailed"));
      return;
    }
    toast.success(t("deleted"));
    void load();
  }

  const authorName = (id: string | null) => {
    if (!id) return t("unknownAuthor");
    const person = profiles.find((p) => p.id === id);
    return person?.full_name || person?.email || t("unknownAuthor");
  };

  const senderLabel = (sender: string) =>
    sender === "customer" ? t("customer") : sender === "bot" ? t("bot") : t("agent");

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <Button size="sm" variant="outline" onClick={openNew}>
          <ClipboardPaste className="size-3.5" />
          {t("paste")}
        </Button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("loading")}
        </p>
      ) : pasted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {pasted.map((row) => (
            <li key={row.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.title || t("untitled")}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {authorName(row.author_id)} · {formatDateTimePt(row.created_at)}
                  </p>
                </div>
                {canChange(row) ? (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={t("edit")} onClick={() => openEdit(row)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t("delete")} onClick={() => void remove(row)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-sky-700">{t("showText")}</summary>
                <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
                  {row.body}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("whatsappTitle")}
        </h3>
        {!deal.contact_id ? (
          <p className="text-xs text-muted-foreground">{t("noContact")}</p>
        ) : loading ? null : whatsapp.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("whatsappEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {whatsapp.map((conv) => (
              <li key={conv.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {t(`status.${conv.status}`)}
                    {conv.last_message_at ? ` · ${formatDateTimePt(conv.last_message_at)}` : ""}
                  </p>
                  <Link
                    href={`/inbox?c=${conv.id}`}
                    className="shrink-0 text-xs font-medium text-sky-700 hover:underline"
                  >
                    {t("openConversation")}
                  </Link>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-sky-700">
                    {t("showMessages", { count: messages[conv.id]?.length ?? 0 })}
                  </summary>
                  <ol className="mt-2 max-h-96 space-y-1.5 overflow-y-auto">
                    {(messages[conv.id] ?? []).map((msg) => (
                      <li key={msg.id} className="text-xs">
                        <span className="font-medium text-foreground">{senderLabel(msg.sender_type)}</span>
                        <span className="text-muted-foreground"> · {formatDateTimePt(msg.created_at)}</span>
                        <p className="whitespace-pre-wrap text-foreground/90">
                          {msg.content_type === "text" || !msg.content_type
                            ? msg.content_text ?? ""
                            : t("mediaLabel", { type: msg.content_type })}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("editTitle") : t("pasteTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("pasteHint")}</p>
            <div className="grid gap-1.5">
              <Label>{t("subject")}</Label>
              <Input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("body")} *</Label>
              <Textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder={t("bodyPlaceholder")}
                rows={10}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={saving || !draftBody.trim()} onClick={() => void save()}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
