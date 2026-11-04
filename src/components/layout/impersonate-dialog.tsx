"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

interface ImpersonationUser {
  id: string;
  email: string;
  fullName: string;
  accountName: string;
}

export function ImpersonateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Sidebar");
  const { user, impersonate } = useAuth();
  const [users, setUsers] = useState<ImpersonationUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSearch("");
    fetch("/api/auth?action=impersonation-users", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { users?: ImpersonationUser[]; error?: { message?: string } }) => {
        if (cancelled) return;
        if (json.error) {
          toast.error(json.error.message || t("impersonateFailed"));
          setUsers([]);
          return;
        }
        setUsers(json.users ?? []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t("impersonateFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const others = users.filter((row) => row.id !== user?.id);
    if (!term) return others;
    return others.filter((row) =>
      [row.fullName, row.email, row.accountName]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [search, user?.id, users]);

  async function enter(userId: string) {
    setSwitching(userId);
    try {
      await impersonate(userId);
    } catch (err) {
      setSwitching(null);
      toast.error(err instanceof Error ? err.message : t("impersonateFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("impersonateTitle")}</DialogTitle>
          <DialogDescription>{t("impersonateDesc")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("impersonateSearch")}
            className="bg-card pl-8"
          />
        </div>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("impersonateEmpty")}
            </p>
          ) : (
            visible.map((row) => (
              <Button
                key={row.id}
                type="button"
                variant="ghost"
                disabled={switching !== null}
                onClick={() => void enter(row.id)}
                className="h-auto w-full justify-start px-2 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.email}
                    {row.accountName ? ` · ${row.accountName}` : ""}
                  </span>
                </span>
                {switching === row.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
