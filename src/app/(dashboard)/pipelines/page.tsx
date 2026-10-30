"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal, DealTask, Profile } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { DealDetailDialog } from "@/components/pipelines/deal-detail-dialog";
import { DealTaskForm } from "@/components/pipelines/deal-task-form";
import { DealFiltersSheet } from "@/components/pipelines/deal-filters-sheet";
import {
  countActiveFilters,
  EMPTY_DEAL_FILTERS,
  type DealFilterState,
} from "@/components/pipelines/deal-filters";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  Clock,
  Filter,
  Handshake,
  Pause,
  Plus,
  Settings,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";
import {
  DEFAULT_PIPELINE_NAME,
  SPEC_DEFAULT_STAGES,
} from "@/lib/pipelines/default-stages";
import { dealMatchesStatusFilter } from "@/lib/pipelines/status";

type StatusFilter = "all" | "open" | "won" | "lost" | "paused" | "not_paused";
type SortFilter = "created_desc" | "created_asc" | "value_desc";

const DEALS_PAGE_SIZE = 15;

function attachNextTasks(deals: Deal[], tasks: DealTask[]): Deal[] {
  const openByDeal = new Map<string, DealTask[]>();
  for (const task of tasks) {
    if (task.done_at) continue;
    const list = openByDeal.get(task.deal_id) ?? [];
    list.push(task);
    openByDeal.set(task.deal_id, list);
  }
  return deals.map((deal) => {
    const list = (openByDeal.get(deal.id) ?? []).sort(
      (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
    );
    return { ...deal, next_task: list[0] ?? null };
  });
}

export default function PipelinesPage() {
  const t = useTranslations("Pipelines.page");
  const tStatus = useTranslations("Pipelines.status");
  const supabase = createClient();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [slimDeals, setSlimDeals] = useState<Deal[]>([]);
  const [richDeals, setRichDeals] = useState<Deal[]>([]);
  const [pageLimit, setPageLimit] = useState<Record<string, number>>({});
  const [cardsLoading, setCardsLoading] = useState(false);
  const [hydrateEpoch, setHydrateEpoch] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [taskDeal, setTaskDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortFilter, setSortFilter] = useState<SortFilter>("created_desc");
  const [filters, setFilters] = useState<DealFilterState>(EMPTY_DEAL_FILTERS);

  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    return data ?? [];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data ?? [];
    },
    [supabase],
  );

  const loadSlimDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select(
          "id, pipeline_id, stage_id, title, value, currency, status, paused, assigned_to, created_at, updated_at, expected_close_date, contact_id",
        )
        .eq("pipeline_id", pipelineId);
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const hydrateDeals = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return [] as Deal[];
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .in("id", ids);
      const rows = (data ?? []) as Deal[];
      if (rows.length === 0) return rows;
      const { data: tasks } = await supabase
        .from("deal_tasks")
        .select("*")
        .in(
          "deal_id",
          rows.map((d) => d.id),
        );
      return attachNextTasks(rows, (tasks as DealTask[]) ?? []);
    },
    [supabase],
  );

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user || !accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({
        user_id: user.id,
        account_id: accountId,
        name: DEFAULT_PIPELINE_NAME,
      })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    await supabase.from("pipeline_stages").insert(
      SPEC_DEFAULT_STAGES.map((s) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        color: s.color,
        position: s.position,
      })),
    );

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      if (cancelled) return;
      setProfiles((profileRows as Profile[]) ?? []);
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline, supabase]);

  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlimDeals([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRichDeals([]);
      return;
    }
    let cancelled = false;
    setCardsLoading(true);
    setPageLimit({});
    setSlimDeals([]);
    setRichDeals([]);
    (async () => {
      const [s, slim] = await Promise.all([
        loadStages(selectedPipelineId),
        loadSlimDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setSlimDeals(slim);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadSlimDeals]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setCardsLoading(true);
    setRichDeals([]);
    setHydrateEpoch((n) => n + 1);
    setSlimDeals(await loadSlimDeals(selectedPipelineId));
  }, [loadSlimDeals, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      const move = (prev: Deal[]) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d));
      setSlimDeals(move);
      setRichDeals(move);
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", dealId);
      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
      }
    },
    [supabase, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleOpenDeal = useCallback((deal: Deal) => {
    setEditingDeal(deal);
    setDetailOpen(true);
  }, []);

  const handleCreateTask = useCallback((deal: Deal) => {
    setTaskDeal(deal);
    setTaskFormOpen(true);
  }, []);

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    if (!accountId) {
      toast.error(t("toastNotLinkedToAccount"));
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    await supabase.from("pipeline_stages").insert(
      SPEC_DEFAULT_STAGES.map((s) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        color: s.color,
        position: s.position,
      })),
    );

    setNewPipelineName("");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t("toastPipelineCreated"));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const activeFilterCount = countActiveFilters(filters);

  const visibleDeals = useMemo(() => {
    let rows = [...slimDeals];
    if (ownerFilter !== "all") {
      rows = rows.filter((d) => d.assigned_to === ownerFilter);
    }
    rows = rows.filter((d) => dealMatchesStatusFilter(d, statusFilter));
    if (filters.name.trim()) {
      const q = filters.name.trim().toLowerCase();
      rows = rows.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.contact?.name ?? "").toLowerCase().includes(q),
      );
    }
    const min = filters.valueMin ? Number(filters.valueMin) : null;
    const max = filters.valueMax ? Number(filters.valueMax) : null;
    if (min != null && !Number.isNaN(min)) {
      rows = rows.filter((d) => Number(d.value || 0) >= min);
    }
    if (max != null && !Number.isNaN(max)) {
      rows = rows.filter((d) => Number(d.value || 0) <= max);
    }
    if (filters.createdFrom) {
      rows = rows.filter((d) => d.created_at.slice(0, 10) >= filters.createdFrom);
    }
    if (filters.closeFrom) {
      rows = rows.filter(
        (d) => (d.expected_close_date ?? "") >= filters.closeFrom,
      );
    }
    rows.sort((a, b) => {
      if (sortFilter === "value_desc") return Number(b.value || 0) - Number(a.value || 0);
      if (sortFilter === "created_asc") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return rows;
  }, [slimDeals, ownerFilter, statusFilter, sortFilter, filters]);

  const cardWindows = useMemo(() => {
    const map = new Map<string, { slice: Deal[]; total: number; value: number }>();
    for (const stage of stages) {
      const rows = visibleDeals.filter((d) => d.stage_id === stage.id);
      const limit = pageLimit[stage.id] ?? DEALS_PAGE_SIZE;
      map.set(stage.id, {
        slice: rows.slice(0, limit),
        total: rows.length,
        value: rows.reduce((sum, d) => sum + Number(d.value || 0), 0),
      });
    }
    return map;
  }, [visibleDeals, stages, pageLimit]);

  const neededIds = useMemo(
    () => [...cardWindows.values()].flatMap((w) => w.slice.map((d) => d.id)),
    [cardWindows],
  );
  const neededKey = neededIds.join(",");

  useEffect(() => {
    const missing = neededIds.filter((id) => !richDeals.some((d) => d.id === id));
    if (missing.length === 0) {
      setCardsLoading(false);
      return;
    }
    let cancelled = false;
    setCardsLoading(true);
    (async () => {
      const rows = await hydrateDeals(missing);
      if (cancelled) return;
      setRichDeals((prev) => {
        const byId = new Map(prev.map((d) => [d.id, d]));
        for (const row of rows) byId.set(row.id, row);
        return [...byId.values()];
      });
      setCardsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // richDeals is read to skip ids already hydrated; including it would refetch.
    // hydrateEpoch forces a reload after a save clears the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededKey, hydrateEpoch, hydrateDeals]);

  const boardDeals = useMemo(() => {
    const rich = new Map(richDeals.map((d) => [d.id, d]));
    const out: Deal[] = [];
    for (const stageWindow of cardWindows.values()) {
      for (const slim of stageWindow.slice) {
        const full = rich.get(slim.id);
        if (full) out.push(full);
      }
    }
    let rows = out;
    if (filters.withoutTask) rows = rows.filter((d) => !d.next_task);
    if (filters.nextTaskFrom) {
      rows = rows.filter(
        (d) => (d.next_task?.due_at ?? "").slice(0, 10) >= filters.nextTaskFrom,
      );
    }
    return rows;
  }, [cardWindows, richDeals, filters.withoutTask, filters.nextTaskFrom]);

  const liveEditingDeal =
    richDeals.find((d) => d.id === editingDeal?.id) ?? editingDeal;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  const statusOptions: { id: StatusFilter; label: string; icon: typeof UserRound }[] = [
    { id: "all", label: tStatus("all"), icon: Handshake },
    { id: "open", label: tStatus("open"), icon: UserRound },
    { id: "won", label: tStatus("won"), icon: ThumbsUp },
    { id: "lost", label: tStatus("lost"), icon: ThumbsDown },
    { id: "paused", label: tStatus("paused"), icon: Pause },
    { id: "not_paused", label: tStatus("not_paused"), icon: Clock },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted">
              <Handshake className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("noPipelinesYet")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <Handshake className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t("managePipelines")}
                </DropdownMenuItem>
              )}
              {canEditSettings && (
                <DropdownMenuItem onClick={() => setNewPipelineOpen(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  {t("addPipeline")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <GatedButton
          canAct={canCreateDeals}
          gateReason="create deals"
          disabled={!selectedPipelineId || stages.length === 0}
          onClick={() => handleAddDeal()}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1 h-4 w-4" />
          {t("addDeal")}
        </GatedButton>
      </div>

      {pipelines.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect
            label={
              ownerFilter === "all"
                ? t("allDeals")
                : profiles.find((p) => p.id === ownerFilter)?.full_name || t("allDeals")
            }
            icon={<UserRound className="h-3.5 w-3.5" />}
          >
            <DropdownMenuItem onClick={() => setOwnerFilter("all")}>
              {t("allDeals")}
            </DropdownMenuItem>
            {profiles.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setOwnerFilter(p.id)}>
                {p.full_name || p.email}
              </DropdownMenuItem>
            ))}
          </ToolbarSelect>

          <ToolbarSelect
            label={tStatus(statusFilter === "all" ? "all" : statusFilter)}
            icon={<Handshake className="h-3.5 w-3.5" />}
          >
            {statusOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
              >
                <opt.icon className="mr-2 h-3.5 w-3.5" />
                {opt.label}
              </DropdownMenuItem>
            ))}
          </ToolbarSelect>

          <ToolbarSelect
            label={
              sortFilter === "created_asc"
                ? t("sortCreatedAsc")
                : sortFilter === "value_desc"
                  ? t("sortValueDesc")
                  : t("sortCreatedDesc")
            }
          >
            <DropdownMenuItem onClick={() => setSortFilter("created_desc")}>
              {t("sortCreatedDesc")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortFilter("created_asc")}>
              {t("sortCreatedAsc")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortFilter("value_desc")}>
              {t("sortValueDesc")}
            </DropdownMenuItem>
          </ToolbarSelect>

          <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
            <Filter className="h-3.5 w-3.5" />
            {t("filtersCount", { count: activeFilterCount })}
          </Button>
        </div>
      )}

      {pipelines.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("countLabel", { count: visibleDeals.length })}
        </p>
      )}

      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <Handshake className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("noPipelinesYet")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("createToStartTracking")}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => setNewPipelineOpen(true)}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createPipeline")}
          </GatedButton>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={stages} deals={visibleDeals} />
          <PipelineBoard
            stages={stages}
            deals={boardDeals}
            stageStats={cardWindows}
            cardsLoading={cardsLoading}
            onLoadMore={(stageId) =>
              setPageLimit((prev) => ({
                ...prev,
                [stageId]: (prev[stageId] ?? DEALS_PAGE_SIZE) + DEALS_PAGE_SIZE,
              }))
            }
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleOpenDeal}
            onCreateTask={handleCreateTask}
          />
        </>
      )}

      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-muted-foreground">{t("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("pipelineNamePlaceholder")}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("defaultStagesDesc")}
            </p>
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t("creating") : t("createPipelineBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={null}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />

      <DealDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        deal={liveEditingDeal}
        stages={stages}
        profiles={profiles}
        onSaved={refreshDeals}
        onCreateTask={(deal) => {
          setDetailOpen(false);
          handleCreateTask(deal);
        }}
      />

      <DealTaskForm
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        deal={taskDeal}
        deals={visibleDeals}
        profiles={profiles}
        onSaved={refreshDeals}
      />

      <DealFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_DEAL_FILTERS)}
      />
    </div>
  );
}

function ToolbarSelect({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted">
        {icon}
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="border-border bg-popover text-popover-foreground"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
