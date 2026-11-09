'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  findExistingCompany,
  findExistingContact,
  isCompanyConflict,
  isExactMatch,
  isUniqueViolation,
} from '@/lib/contacts/dedupe';
import { addContactTag, deleteContactTag } from '@/lib/contacts/tag-api';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { formatCurrency } from '@/lib/currency';
import { dealDisplayStatus } from '@/lib/pipelines/status';
import { DealTaskForm } from '@/components/pipelines/deal-task-form';
import { toast } from 'sonner';
import type { Contact, Tag, ContactNote, CustomField, Deal, DealTask, MessageTemplate, Profile } from '@/types';
import { taskKindMessageKey } from '@/lib/pipelines/task-kinds';
import {
  TemplatePicker,
  type TemplateSendValues,
} from '@/components/inbox/template-picker';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FieldSelect } from '@/components/ui/field-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building2,
  Copy,
  Check,
  Loader2,
  Plus,
  Trash2,
  Save,
  X,
  DollarSign,
  LayoutTemplate,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

function historyStatusText(
  text: string,
  tStatus: (key: 'open' | 'won' | 'lostFemale' | 'paused') => string,
) {
  const [code, ...rest] = text.split(' · ');
  const label =
    code === 'won'
      ? tStatus('won')
      : code === 'lost'
        ? tStatus('lostFemale')
        : code === 'paused'
          ? tStatus('paused')
          : tStatus('open');
  return [label, ...rest].join(' · ');
}

interface ContactDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string | null;
  onUpdated: () => void;
  /** Opens the client 360 (history + tasks) instead of the details tab. */
  initialTab?: 'details' | 'overview';
  /** Full page instead of the side sheet. */
  asPage?: boolean;
}

type ClientTask = DealTask & { dealTitle: string };

type HistoryRow = {
  id: string;
  at: string;
  kind: 'deal' | 'stage' | 'status' | 'tag' | 'note' | 'task' | 'taskDone';
  text: string;
};

export function ContactDetailView({
  open,
  onOpenChange,
  contactId,
  onUpdated,
  initialTab = 'details',
  asPage = false,
}: ContactDetailViewProps) {
  const t = useTranslations('Contacts.detailView');
  const tForm = useTranslations('Contacts.form');
  const router = useRouter();
  const tTasks = useTranslations('Pipelines.tasks');
  const tStatus = useTranslations('Pipelines.status');
  const canDelete = useCan('delete-records');
  const canEdit = useCan('send-messages');
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(Boolean(contactId));
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Send template — lets the business initiate (or re-open) a conversation
  // with this contact by sending an approved template. The send route
  // find-or-creates the conversation, so no inbound message is required.
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // Details tab
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editAssignedTo, setEditAssignedTo] = useState('');
  const [owners, setOwners] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);

  // Tags tab
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [contactTagIds, setContactTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);

  // Notes tab
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Custom fields tab
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [savingCustom, setSavingCustom] = useState(false);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Deals tab
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);

  const [clientTasks, setClientTasks] = useState<ClientTask[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);

    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (data) {
      setContact(data);
      setEditName(data.name ?? '');
      setEditPhone(data.phone);
      setEditEmail(data.email ?? '');
      setEditCompany(data.company ?? '');
      setEditAssignedTo(data.assigned_to ?? '');
    }
    setLoading(false);
  }, [contactId, supabase]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name')
      .then(({ data }) => {
        if (data) setOwners(data);
      });
  }, [open, supabase]);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;

    const [tagsRes, contactTagsRes] = await Promise.all([
      supabase.from('tags').select('*').order('name'),
      supabase.from('contact_tags').select('tag_id').eq('contact_id', contactId),
    ]);

    if (tagsRes.data) setAllTags(tagsRes.data);
    if (contactTagsRes.data) {
      setContactTagIds(contactTagsRes.data.map((ct) => ct.tag_id));
    }
  }, [contactId, supabase]);

  const fetchNotes = useCallback(async () => {
    if (!contactId) return;
    setLoadingNotes(true);

    const { data } = await supabase
      .from('contact_notes')
      .select('*')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (data) {
      const authorIds = [
        ...new Set(
          (data as ContactNote[])
            .map((note) => note.user_id)
            .filter(Boolean),
        ),
      ];
      const emails = new Map<string, string>();
      if (authorIds.length > 0) {
        const { data: people } = await supabase
          .from('profiles')
          .select('user_id, email')
          .in('user_id', authorIds);
        for (const person of (people ?? []) as Array<{
          user_id: string;
          email: string | null;
        }>) {
          if (person.email) emails.set(person.user_id, person.email);
        }
      }
      setNotes(
        (data as ContactNote[]).map((note) => ({
          ...note,
          author_email: emails.get(note.user_id) ?? null,
        })),
      );
    }
    setLoadingNotes(false);
  }, [contactId, supabase]);

  const fetchCustomFields = useCallback(async () => {
    if (!contactId) return;
    setLoadingCustom(true);

    const [fieldsRes, valuesRes] = await Promise.all([
      supabase.from('custom_fields').select('*').order('field_name'),
      supabase
        .from('contact_custom_values')
        .select('*')
        .eq('contact_id', contactId),
    ]);

    if (fieldsRes.data) setCustomFields(fieldsRes.data);
    if (valuesRes.data) {
      const map: Record<string, string> = {};
      valuesRes.data.forEach((v) => {
        map[v.custom_field_id] = v.value ?? '';
      });
      setCustomValues(map);
    }
    setLoadingCustom(false);
  }, [contactId, supabase]);

  const fetchDeals = useCallback(async () => {
    if (!contactId) return;
    setLoadingDeals(true);
    const { data } = await supabase
      .from('deals')
      .select('*, stage:pipeline_stages(*)')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
    setLoadingDeals(false);
  }, [contactId, supabase]);

  const fetchOverview = useCallback(async () => {
    if (!contactId) return;
    setLoadingOverview(true);

    const [dealRes, noteRes, tagRes] = await Promise.all([
      supabase
        .from('deals')
        .select('id, title, value, currency, status, paused, created_at, updated_at, closed_at, stage:pipeline_stages(id, name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_notes')
        .select('id, note_text, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('contact_tags')
        .select('id, created_at, tag:tags(id, name)')
        .eq('contact_id', contactId),
    ]);

    const dealRows = (dealRes.data ?? []) as Array<{
      id: string;
      title: string;
      value: number;
      currency?: string;
      status?: Deal['status'];
      paused?: boolean;
      created_at: string;
      updated_at?: string;
      closed_at?: string | null;
      stage?: { name?: string } | null;
    }>;
    const dealIds = dealRows.map((deal) => deal.id);

    const taskRes = dealIds.length
      ? await supabase
          .from('deal_tasks')
          .select('*')
          .in('deal_id', dealIds)
          .order('due_at', { ascending: true })
      : { data: [] as DealTask[] };

    const titleByDeal = new Map(dealRows.map((deal) => [deal.id, deal.title]));
    const tasks = ((taskRes.data ?? []) as DealTask[]).map((task) => ({
      ...task,
      dealTitle: titleByDeal.get(task.deal_id) ?? '',
    }));
    setClientTasks(tasks);

    const tagRows = (tagRes.data ?? []) as Array<{
      id: string;
      created_at?: string;
      tag?: { name?: string } | Array<{ name?: string }> | null;
    }>;
    const rows: HistoryRow[] = [
      ...dealRows.flatMap((deal) => {
        const status = dealDisplayStatus(deal as Deal);
        const events: HistoryRow[] = [
          {
            id: `deal-${deal.id}`,
            at: deal.created_at,
            kind: 'deal',
            text: deal.title,
          },
          {
            id: `status-${deal.id}`,
            at:
              status === 'won' || status === 'lost'
                ? deal.closed_at || deal.updated_at || deal.created_at
                : deal.updated_at || deal.created_at,
            kind: 'status',
            text: `${status} · ${deal.title}`,
          },
        ];
        if (deal.stage?.name) {
          events.push({
            id: `stage-${deal.id}`,
            at: deal.updated_at || deal.created_at,
            kind: 'stage',
            text: `${deal.stage.name} · ${deal.title}`,
          });
        }
        return events;
      }),
      ...((noteRes.data ?? []) as Array<{
        id: string;
        note_text: string;
        created_at: string;
      }>).map((note) => ({
        id: `note-${note.id}`,
        at: note.created_at,
        kind: 'note' as const,
        text: note.note_text,
      })),
      ...tagRows.flatMap((row) => {
        const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
        const name = tag?.name?.trim();
        if (!name) return [];
        return [
          {
            id: `tag-${row.id}`,
            at: row.created_at || new Date(0).toISOString(),
            kind: 'tag' as const,
            text: name,
          },
        ];
      }),
      ...tasks.flatMap((task) => {
        const events: HistoryRow[] = [
          {
            id: `task-${task.id}`,
            at: task.created_at,
            kind: 'task',
            text: [task.title, task.dealTitle].filter(Boolean).join(' · '),
          },
        ];
        if (task.done_at) {
          events.push({
            id: `task-done-${task.id}`,
            at: task.done_at,
            kind: 'taskDone',
            text: [task.title, task.dealTitle].filter(Boolean).join(' · '),
          });
        }
        return events;
      }),
    ];
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setHistory(rows);
    setLoadingOverview(false);
  }, [contactId, supabase]);

  useEffect(() => {
    if (open && contactId) {
      fetchContact();
      fetchTags();
      fetchNotes();
      fetchCustomFields();
      fetchDeals();
      fetchOverview();
    }
  }, [open, contactId, fetchContact, fetchTags, fetchNotes, fetchCustomFields, fetchDeals, fetchOverview]);

  async function copyPhone() {
    if (!contact) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  async function saveDetails() {
    if (!contactId || !editPhone.trim()) {
      toast.error(t('toastPhoneRequired'));
      return;
    }

    if (accountId) {
      const phoneHit = await findExistingContact(
        supabase,
        accountId,
        editPhone.trim(),
        contactId,
      );
      if (phoneHit && isExactMatch(phoneHit, editPhone.trim())) {
        toast.error(tForm('toastConflict'));
        return;
      }
      if (contact?.is_company) {
        const companyHit = await findExistingCompany(
          supabase,
          accountId,
          editCompany.trim(),
          contactId,
        );
        if (companyHit) {
          toast.error(tForm('toastCompanyConflict'));
          return;
        }
      }
    }

    setSavingDetails(true);
    const { error } = await supabase
      .from('contacts')
      .update({
        name: editName.trim() || null,
        phone: editPhone.trim(),
        email: editEmail.trim() || null,
        company: editCompany.trim() || null,
        assigned_to: editAssignedTo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId);

    if (error) {
      toast.error(
        isCompanyConflict(error)
          ? tForm('toastCompanyConflict')
          : isUniqueViolation(error)
            ? tForm('toastConflict')
            : t('toastUpdateFailed'),
      );
    } else {
      toast.success(t('toastUpdated'));
      fetchContact();
      onUpdated();
    }
    setSavingDetails(false);
  }

  async function toggleTag(tagId: string) {
    if (!contactId) return;
    setSavingTags(true);

    const isSelected = contactTagIds.includes(tagId);

    try {
      if (isSelected) {
        await deleteContactTag(contactId, tagId);
        setContactTagIds((prev) => prev.filter((id) => id !== tagId));
      } else {
        await addContactTag(contactId, tagId);
        setContactTagIds((prev) => [...prev, tagId]);
      }
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('toastUpdateFailed'));
    }
    setSavingTags(false);
  }

  async function addNote() {
    if (!contactId || !newNote.trim()) return;
    setSavingNote(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) {
      toast.error(t('toastNotAuthenticated'));
      setSavingNote(false);
      return;
    }

    const { error } = await supabase.from('contact_notes').insert({
      contact_id: contactId,
      account_id: accountId,
      user_id: user.id,
      note_text: newNote.trim(),
    });

    if (error) {
      toast.error(t('toastNoteAddFailed'));
    } else {
      setNewNote('');
      fetchNotes();
      toast.success(t('toastNoteAdded'));
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    const { error } = await supabase
      .from('contact_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      toast.error(t('toastNoteDeleteFailed'));
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success(t('toastNoteDeleted'));
    }
  }

  async function saveCustomFields() {
    if (!contactId) return;
    setSavingCustom(true);

    try {
      // Delete existing values and re-insert
      await supabase
        .from('contact_custom_values')
        .delete()
        .eq('contact_id', contactId);

      const rows = Object.entries(customValues)
        .filter(([, val]) => val.trim())
        .map(([fieldId, val]) => ({
          contact_id: contactId,
          custom_field_id: fieldId,
          value: val.trim(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('contact_custom_values')
          .insert(rows);
        if (error) throw error;
      }

      toast.success(t('toastCustomFieldsSaved'));
    } catch {
      toast.error(t('toastCustomFieldsFailed'));
    }
    setSavingCustom(false);
  }

  async function handleSendTemplate(
    template: MessageTemplate,
    values: TemplateSendValues,
  ) {
    if (!contactId) return;
    setSendingTemplate(true);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // No conversation_id — the route find-or-creates one for this
          // contact, mirroring the inbox template-send payload otherwise.
          contact_id: contactId,
          message_type: 'template',
          template_name: template.name,
          template_language: template.language,
          template_message_params: {
            body: values.body,
            headerText: values.headerText,
            buttonParams: values.buttonParams,
          },
          template_params: values.body,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = payload?.error || `HTTP ${res.status}`;
        toast.error(t('toastTemplateFailed', { reason }));
        return;
      }

      toast.success(t('toastTemplateSent', { name: template.name }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'network error';
      toast.error(`Failed to send template: ${reason}`);
    } finally {
      setSendingTemplate(false);
    }
  }

  function getInitials(name?: string | null) {
    if (!name) return '?';
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const panel = (
    <>
        {loading || !contact ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="p-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <Avatar className="size-12 bg-muted border border-border">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                    {getInitials(contact.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  {asPage ? (
                    <h1 className="truncate text-lg font-medium text-popover-foreground">
                      {contact.name || t('unnamed')}
                    </h1>
                  ) : (
                    <SheetTitle className="text-popover-foreground truncate">
                      {contact.name || t('unnamed')}
                    </SheetTitle>
                  )}
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {t('contactDetailsDesc')}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <button
                      onClick={copyPhone}
                      className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                    >
                      <Phone className="size-3" />
                      {contact.phone}
                      {copiedPhone ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                    {contact.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" />
                        {contact.email}
                      </span>
                    )}
                    {contact.company && (
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {contact.company}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => setTemplatePickerOpen(true)}
                  disabled={sendingTemplate}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {sendingTemplate ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LayoutTemplate className="size-4" />
                  )}
                  {t('sendTemplateBtn')}
                </Button>
              </div>
            </SheetHeader>

            {/* Tabs */}
            <Tabs
              key={`${contactId ?? 'none'}-${initialTab}`}
              defaultValue={initialTab}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="bg-muted/50 border-b border-border mx-4 mt-3 w-auto max-w-full overflow-x-auto">
                <TabsTrigger
                  value="overview"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.overview')}
                </TabsTrigger>
                <TabsTrigger
                  value="details"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.details')}
                </TabsTrigger>
                <TabsTrigger
                  value="tags"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.tags')}
                </TabsTrigger>
                <TabsTrigger
                  value="notes"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.notes')}
                </TabsTrigger>
                <TabsTrigger
                  value="custom"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.custom')}
                </TabsTrigger>
                <TabsTrigger
                  value="deals"
                  className="data-active:bg-muted data-active:text-primary text-muted-foreground"
                >
                  {t('tabs.deals')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingOverview ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <section>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">{t('overviewTab.tasks')}</h3>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (deals.length === 0) {
                              toast.error(t('overviewTab.needDeal'));
                              return;
                            }
                            setTaskFormOpen(true);
                          }}
                        >
                          <Plus className="size-3.5" />
                          {t('overviewTab.createTask')}
                        </Button>
                      </div>
                      {clientTasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('overviewTab.noTasks')}</p>
                      ) : (
                        <ul className="space-y-2">
                          {clientTasks.map((task) => {
                            const seller = owners.find((owner) => owner.id === task.assignee_id);
                            return (
                              <li
                                key={task.id}
                                className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                              >
                                <p className={task.done_at ? 'text-sm text-muted-foreground line-through' : 'text-sm font-medium'}>
                                  {task.title}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {tTasks(taskKindMessageKey(task.kind))}
                                  {task.dealTitle ? ` · ${task.dealTitle}` : ''}
                                  {seller ? ` · ${seller.full_name || seller.email || ''}` : ''}
                                  {' · '}
                                  {new Date(task.due_at).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                    <section>
                      <h3 className="mb-2 text-sm font-semibold">{t('overviewTab.history')}</h3>
                      {history.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('overviewTab.noHistory')}</p>
                      ) : (
                        <ul className="space-y-2">
                          {history.map((item) => (
                            <li key={item.id} className="rounded-lg border border-border px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium text-primary">
                                  {item.kind === 'deal'
                                    ? t('overviewTab.dealCreated')
                                    : item.kind === 'stage'
                                      ? t('overviewTab.dealStage')
                                      : item.kind === 'status'
                                        ? t('overviewTab.dealStatus')
                                        : item.kind === 'tag'
                                          ? t('overviewTab.tag')
                                          : item.kind === 'note'
                                            ? t('overviewTab.note')
                                            : item.kind === 'taskDone'
                                              ? t('overviewTab.taskDone')
                                              : t('overviewTab.taskOpen')}
                                </p>
                                <p className="shrink-0 text-[10px] text-muted-foreground">
                                  {new Date(item.at).toLocaleString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              {item.text ? (
                                <p className="mt-0.5 text-sm text-foreground">
                                  {item.kind === 'status' ? historyStatusText(item.text, tStatus) : item.text}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                )}
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('name')}</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">
                      {t('phone')} <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('email')}</Label>
                    <Input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">{t('company')}</Label>
                    <Input
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      className="bg-muted border-border text-foreground h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5 border-t border-border pt-3">
                    <p className="text-xs font-medium text-foreground">{t('attributions')}</p>
                    <Label className="text-muted-foreground text-xs">{t('owner')}</Label>
                    {canEdit ? (
                      <FieldSelect
                        value={editAssignedTo}
                        onValueChange={setEditAssignedTo}
                        placeholder={t('ownerNone')}
                        className="bg-muted"
                        options={[
                          { value: '', label: t('ownerNone') },
                          ...owners.map((owner) => ({
                            value: owner.id,
                            label: owner.full_name || owner.email || '',
                          })),
                        ]}
                      />
                    ) : (
                      <p className="text-sm text-foreground">
                        {owners.find((owner) => owner.id === editAssignedTo)?.full_name || t('ownerNone')}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                    size="sm"
                  >
                    {savingDetails ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {t('saveChangesBtn')}
                  </Button>
                </div>
              </TabsContent>

              {/* Tags Tab */}
              <TabsContent value="tags" className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {t('tagsTab.clickTagDesc')}
                  </p>
                  {allTags.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('tagsTab.noTagsAvailable')}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {allTags.map((tag) => {
                        const selected = contactTagIds.includes(tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            disabled={savingTags}
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                              selected
                                ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                                : 'opacity-50 hover:opacity-80'
                            }`}
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {selected && <Check className="size-3 mr-1" />}
                            {tag.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Notes Tab */}
              <TabsContent value="notes" className="flex-1 flex flex-col min-h-0 px-4 py-3">
                <div className="space-y-2 mb-3">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder={t('notesTab.placeholder')}
                    className="bg-muted border-border text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm resize-none"
                  />
                  <Button
                    onClick={addNote}
                    disabled={!newNote.trim() || savingNote}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    size="sm"
                  >
                    {savingNote ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Plus className="size-3.5" />
                    )}
                    {t('notesTab.save')}
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {t('notesTab.noNotes')}
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg bg-muted/50 border border-border/50 p-3 group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap flex-1">
                            {note.note_text}
                          </p>
                          {canDelete && (
                            <button
                              onClick={() => deleteNote(note.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all cursor-pointer shrink-0"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {note.author_email ? `${note.author_email} · ` : ''}
                          {new Date(note.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* Custom Fields Tab */}
              <TabsContent value="custom" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingCustom ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {t('noCustomFields')}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customFields.map((field) => (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs capitalize">
                          {field.field_name}
                        </Label>
                        <Input
                          value={customValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCustomValues((prev) => ({
                              ...prev,
                              [field.id]: e.target.value,
                            }))
                          }
                          placeholder={t('enterCustomField', { name: field.field_name })}
                          className="bg-muted border-border text-foreground h-8 text-sm placeholder:text-muted-foreground"
                        />
                      </div>
                    ))}
                    <Button
                      onClick={saveCustomFields}
                      disabled={savingCustom}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                      size="sm"
                    >
                      {savingCustom ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Save className="size-3.5" />
                      )}
                      {t('saveCustomFieldsBtn')}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Deals Tab */}
              <TabsContent value="deals" className="flex-1 overflow-y-auto px-4 py-3">
                {loadingDeals ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-primary" />
                  </div>
                ) : deals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('dealsTab.noDeals')}</p>
                ) : (
                  <div className="space-y-2">
                    {deals.map((deal) => (
                      <div
                        key={deal.id}
                        className="rounded-lg border border-border bg-muted/50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/pipelines/${deal.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                            {deal.title}
                          </Link>
                          {deal.stage && (
                            <span
                              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor: `${deal.stage.color}20`,
                                color: deal.stage.color,
                              }}
                            >
                              {deal.stage.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <DollarSign className="size-3" />
                            {formatCurrency(
                              deal.value ?? 0,
                              deal.currency || defaultCurrency,
                            )}
                          </span>
                          <span
                            className={
                              dealDisplayStatus(deal) === 'won'
                                ? 'font-medium text-emerald-600'
                                : dealDisplayStatus(deal) === 'lost'
                                  ? 'font-medium text-red-400'
                                  : 'font-medium text-foreground'
                            }
                          >
                            {dealDisplayStatus(deal) === 'won'
                              ? tStatus('won')
                              : dealDisplayStatus(deal) === 'lost'
                                ? tStatus('lostFemale')
                                : dealDisplayStatus(deal) === 'paused'
                                  ? tStatus('paused')
                                  : tStatus('open')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
    </>
  );

  return (
    <>
    {asPage ? (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          {t('back')}
        </Button>
        <div className="flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground">
          {!loading && !contact ? (
            <p className="p-6 text-sm text-muted-foreground">{t('notFound')}</p>
          ) : (
            panel
          )}
        </div>
      </div>
    ) : (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
        >
          {panel}
        </SheetContent>
      </Sheet>
    )}
    <TemplatePicker
      open={templatePickerOpen}
      onOpenChange={setTemplatePickerOpen}
      onSelect={handleSendTemplate}
    />
    <DealTaskForm
      open={taskFormOpen}
      onOpenChange={setTaskFormOpen}
      deal={deals[0] ?? null}
      deals={deals}
      profiles={owners as Profile[]}
      onSaved={() => {
        fetchDeals();
        fetchOverview();
      }}
    />
    </>
  );
}
