"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { useTranslations } from "next-intl"

import { DealTaskForm } from "@/components/pipelines/deal-task-form"
import { Button } from "@/components/ui/button"
import { GatedButton } from "@/components/ui/gated-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth } from "@/hooks/use-auth"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/currency"
import {
  TASK_KINDS,
  profileLabel,
  taskKindMessageKey,
  taskSeller,
} from "@/lib/pipelines/task-kinds"
import { createClient } from "@/lib/supabase/client"
import type { Deal, DealTask, Profile } from "@/types"

type StatusFilter = "all" | "pending" | "done"
type KindFilter = "all" | (typeof TASK_KINDS)[number]

type TaskRow = DealTask & {
  deal?: (Pick<Deal, "id" | "title" | "value" | "currency" | "assigned_to"> & {
    assignee?: Profile | null
  }) | null
}

function localDateKey(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const filterClass =
  "h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none"

export default function TasksPage() {
  const t = useTranslations("Tasks.page")
  const tTasks = useTranslations("Pipelines.tasks")
  const supabase = createClient()
  const { defaultCurrency } = useAuth()
  const canCreate = useCan("send-messages")

  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusFilter>("all")
  const [kind, setKind] = useState<KindFilter>("all")
  const [sellerId, setSellerId] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [taskRes, dealRes, profileRes] = await Promise.all([
      supabase
        .from("deal_tasks")
        .select("*, assignee:profiles!deal_tasks_assignee_id_fkey(id, full_name, email)")
        .order("due_at", { ascending: false }),
      supabase
        .from("deals")
        .select(
          "*, contact:contacts(id, name, phone, company), assignee:profiles!deals_assigned_to_fkey(id, full_name, email)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").order("full_name"),
    ])
    setTasks((taskRes.data as TaskRow[]) ?? [])
    setDeals((dealRes.data as Deal[]) ?? [])
    setProfiles((profileRes.data as Profile[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await load()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const sellers = useMemo(() => {
    const byId = new Map<string, string>()
    for (const profile of profiles) {
      const name = profileLabel(profile)
      if (name) byId.set(profile.id, name)
    }
    for (const task of tasks) {
      const seller = taskSeller(task, profiles)
      if (seller?.id && seller.name && !byId.has(seller.id)) {
        byId.set(seller.id, seller.name)
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [profiles, tasks])

  const rows = useMemo(() => {
    const dealById = new Map(deals.map((deal) => [deal.id, deal]))
    return tasks.map((task) => {
      const loaded = dealById.get(task.deal_id)
      if (!loaded) return task
      return {
        ...task,
        deal: {
          id: loaded.id,
          title: loaded.title,
          value: loaded.value,
          currency: loaded.currency,
          assigned_to: loaded.assigned_to,
          assignee: loaded.assignee ?? null,
        },
      }
    }).filter((task) => {
      if (status === "done" && !task.done_at) return false
      if (status === "pending" && task.done_at) return false
      if (kind !== "all" && task.kind !== kind) return false
      if (sellerId !== "all" && taskSeller(task, profiles)?.id !== sellerId) {
        return false
      }
      const day = localDateKey(task.due_at)
      if (from && day < from) return false
      if (to && day > to) return false
      return true
    })
  }, [tasks, deals, status, kind, sellerId, from, to, profiles])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason="create tasks"
          disabled={deals.length === 0}
          onClick={() => setFormOpen(true)}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("create")}
        </GatedButton>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("status")}
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className={filterClass}
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="pending">{t("pending")}</option>
          <option value="done">{t("done")}</option>
        </select>
        <select
          aria-label={t("kind")}
          value={kind}
          onChange={(event) => setKind(event.target.value as KindFilter)}
          className={filterClass}
        >
          <option value="all">{t("allKinds")}</option>
          {TASK_KINDS.map((item) => (
            <option key={item} value={item}>
              {tTasks(taskKindMessageKey(item))}
            </option>
          ))}
        </select>
        <select
          aria-label={t("seller")}
          value={sellerId}
          onChange={(event) => setSellerId(event.target.value)}
          className={filterClass}
        >
          <option value="all">{t("allSellers")}</option>
          {sellers.map((seller) => (
            <option key={seller.id} value={seller.id}>
              {seller.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          aria-label={t("from")}
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className={filterClass}
        />
        <input
          type="date"
          aria-label={t("to")}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className={filterClass}
        />
        {from || to || sellerId !== "all" || kind !== "all" || status !== "all" ? (
          <Button
            variant="ghost"
            onClick={() => {
              setStatus("all")
              setKind("all")
              setSellerId("all")
              setFrom("")
              setTo("")
            }}
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colTask")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead>{t("colWhen")}</TableHead>
              <TableHead>{t("colDeal")}</TableHead>
              <TableHead>{t("colSeller")}</TableHead>
              <TableHead className="text-right">{t("colValue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-muted-foreground">
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((task) => {
                const seller = taskSeller(task, profiles)
                const value = Number(task.deal?.value) || 0
                return (
                  <TableRow key={task.id}>
                    <TableCell className="whitespace-normal">
                      <p className="font-medium text-foreground">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {tTasks(taskKindMessageKey(task.kind))}
                      </p>
                    </TableCell>
                    <TableCell>
                      {task.done_at ? t("statusDone") : t("statusPending")}
                    </TableCell>
                    <TableCell>{formatWhen(task.due_at)}</TableCell>
                    <TableCell className="max-w-[240px] truncate">
                      {task.deal?.title || "—"}
                    </TableCell>
                    <TableCell>{seller?.name || t("noSeller")}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(value, task.deal?.currency || defaultCurrency)}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DealTaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        deal={null}
        deals={deals}
        profiles={profiles}
        onSaved={() => {
          void load()
        }}
      />
    </div>
  )
}
