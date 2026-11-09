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

interface RealtimeSubscriber {
  onOpen: () => void;
  onError: () => void;
  onMessage: (data: string) => void;
}

/**
 * One shared `EventSource` per browser tab.
 *
 * Browsers cap concurrent HTTP/1.1 connections per origin at 6, and an
 * SSE stream holds its connection open forever. The app opens several
 * realtime channels at once (presence, notifications, unread counts,
 * inbox messages, reactions), so giving each channel its own stream used
 * up the whole budget — a second tab was enough to starve every ordinary
 * `fetch`, and sends sat queued in the browser without ever reaching the
 * server. Channels now multiplex over a single stream and filter events
 * client-side; the stream opens with the first subscriber and closes
 * with the last.
 */
class SharedRealtime {
  private source: EventSource | null = null;
  private readonly subscribers = new Set<RealtimeSubscriber>();
  private connected = false;

  add(sub: RealtimeSubscriber) {
    this.subscribers.add(sub);
    if (!this.source) {
      this.connect();
    } else if (this.connected) {
      queueMicrotask(() => {
        if (this.subscribers.has(sub)) sub.onOpen();
      });
    }
  }

  remove(sub: RealtimeSubscriber) {
    this.subscribers.delete(sub);
    if (this.subscribers.size === 0) this.disconnect();
  }

  private connect() {
    const source = new EventSource("/api/realtime");
    this.source = source;
    source.onopen = () => {
      this.connected = true;
      for (const sub of [...this.subscribers]) sub.onOpen();
    };
    source.onerror = () => {
      this.connected = false;
      for (const sub of [...this.subscribers]) sub.onError();
    };
    source.onmessage = (ev) => {
      for (const sub of [...this.subscribers]) sub.onMessage(ev.data);
    };
  }

  private disconnect() {
    this.source?.close();
    this.source = null;
    this.connected = false;
  }
}

const sharedRealtime = new SharedRealtime();

class BrowserChannel implements RealtimeChannel {
  private listeners: Array<{ filter: RealtimeFilter; cb: RealtimeCallback }> =
    [];
  private subscriber: RealtimeSubscriber | null = null;

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
    if (this.subscriber) sharedRealtime.remove(this.subscriber);
    this.subscriber = {
      onOpen: () => status?.("SUBSCRIBED"),
      onError: () => status?.("CHANNEL_ERROR"),
      onMessage: (data) => this.dispatch(data),
    };
    sharedRealtime.add(this.subscriber);
    return this;
  }

  private dispatch(data: string) {
    try {
      const payload = JSON.parse(data) as {
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
  }

  unsubscribe() {
    if (this.subscriber) sharedRealtime.remove(this.subscriber);
    this.subscriber = null;
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
