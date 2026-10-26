import { publicUrl } from "./public-url";
import { QueryBuilder } from "./query-chain";
import type {
  AuthApi,
  ExecContext,
  QueryResult,
  QuerySpec,
  RealtimeCallback,
  RealtimeChannel,
  RealtimeFilter,
  Session,
  StorageBucket,
  SupabaseClient as DbClient,
  UploadOptions,
} from "./types";

export type { DbClient as SupabaseClient };

function parseFilter(raw?: string): { column: string; value: string } | null {
  if (!raw) return null;
  const m = raw.match(/^([^=]+)=eq\.(.+)$/);
  if (!m) return null;
  return { column: m[1], value: m[2] };
}

class BrowserChannel implements RealtimeChannel {
  private listeners: Array<{ filter: RealtimeFilter; cb: RealtimeCallback }> =
    [];
  private source: EventSource | null = null;

  constructor(private readonly name: string) {}

  on(
    _event: "postgres_changes",
    filter: RealtimeFilter,
    cb: RealtimeCallback,
  ): RealtimeChannel {
    this.listeners.push({ filter, cb });
    return this;
  }

  subscribe(status?: (s: string) => void): RealtimeChannel {
    const tables = [
      ...new Set(this.listeners.map((l) => l.filter.table).filter(Boolean)),
    ];
    const url = `/api/realtime?tables=${encodeURIComponent(tables.join(","))}&ch=${encodeURIComponent(this.name)}`;
    this.source = new EventSource(url);
    this.source.onopen = () => status?.("SUBSCRIBED");
    this.source.onerror = () => status?.("CHANNEL_ERROR");
    this.source.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          schema: string;
          table: string;
          new: Record<string, unknown>;
          old: Record<string, unknown>;
        };
        for (const listener of this.listeners) {
          if (listener.filter.table && listener.filter.table !== payload.table) {
            continue;
          }
          if (
            listener.filter.event !== "*" &&
            listener.filter.event !== payload.eventType
          ) {
            continue;
          }
          const parsed = parseFilter(listener.filter.filter);
          if (parsed) {
            const row =
              payload.eventType === "DELETE" ? payload.old : payload.new;
            if (String(row?.[parsed.column]) !== parsed.value) continue;
          }
          listener.cb(payload);
        }
      } catch {
        // ignore malformed events
      }
    };
    return this;
  }

  unsubscribe() {
    this.source?.close();
    this.source = null;
  }
}

async function remoteRun(spec: QuerySpec): Promise<QueryResult> {
  const res = await fetch("/api/db", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(spec),
  });
  return (await res.json()) as QueryResult;
}

function createBrowserAuth(): AuthApi {
  const listeners = new Set<(event: string, session: Session | null) => void>();

  async function call(action: string, body: Record<string, unknown> = {}) {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, ...body }),
    });
    return res.json();
  }

  const auth: AuthApi = {
    async getUser() {
      const res = await fetch("/api/auth?action=session", {
        credentials: "include",
      });
      const json = await res.json();
      return { data: { user: json.user ?? null }, error: json.error ?? null };
    },
    async getSession() {
      const res = await fetch("/api/auth?action=session", {
        credentials: "include",
      });
      const json = await res.json();
      return {
        data: { session: json.session ?? null },
        error: json.error ?? null,
      };
    },
    async signInWithPassword(creds) {
      const json = await call("signin", creds);
      if (!json.error) {
        listeners.forEach((cb) => cb("SIGNED_IN", json.session ?? null));
      }
      return json;
    },
    async signUp(creds) {
      const json = await call("signup", creds);
      if (!json.error) {
        listeners.forEach((cb) => cb("SIGNED_IN", json.session ?? null));
      }
      return json;
    },
    async signOut() {
      const json = await call("signout");
      listeners.forEach((cb) => cb("SIGNED_OUT", null));
      return json;
    },
    async updateUser(attrs) {
      return call("update", attrs);
    },
    async resetPasswordForEmail(email, opts) {
      return call("reset", { email, redirectTo: opts?.redirectTo });
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      void auth.getSession().then(({ data }) => cb("INITIAL_SESSION", data.session));
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(cb);
            },
          },
        },
      };
    },
  };
  return auth;
}

function browserStorage(): { from: (bucket: string) => StorageBucket } {
  return {
    from(bucket: string): StorageBucket {
      return {
        async upload(objectPath, file, options?: UploadOptions) {
          const form = new FormData();
          form.set("bucket", bucket);
          form.set("path", objectPath);
          form.set("upsert", options?.upsert ? "1" : "0");
          if (options?.contentType) form.set("contentType", options.contentType);
          const blob =
            file instanceof Blob
              ? file
              : new Blob([file as BlobPart], {
                  type: options?.contentType ?? "application/octet-stream",
                });
          form.set("file", blob);
          const res = await fetch("/api/storage", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          const json = await res.json();
          return json.error
            ? { data: null, error: json.error }
            : { data: { path: objectPath }, error: null };
        },
        async remove(paths) {
          const res = await fetch("/api/storage", {
            method: "DELETE",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bucket, paths }),
          });
          const json = await res.json();
          return { data: null, error: json.error ?? null };
        },
        getPublicUrl(objectPath) {
          return { data: { publicUrl: publicUrl(bucket, objectPath) } };
        },
      };
    },
  };
}

export function createBrowserDbClient(): DbClient {
  const ctx: ExecContext = { role: "authenticated", userId: null };
  const channels = new Set<BrowserChannel>();
  return {
    from(table: string) {
      return new QueryBuilder(ctx, { op: "select", table }, remoteRun);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      return new QueryBuilder(
        ctx,
        { op: "rpc", rpc: fn, rpcArgs: args },
        remoteRun,
      );
    },
    auth: createBrowserAuth(),
    storage: browserStorage(),
    channel(name: string) {
      const ch = new BrowserChannel(name);
      channels.add(ch);
      return ch;
    },
    removeChannel(ch: RealtimeChannel) {
      ch.unsubscribe();
      channels.delete(ch as BrowserChannel);
    },
  };
}
