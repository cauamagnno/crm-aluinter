export interface PostgrestError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface QueryResult<T = any> {
  data: T;
  error: PostgrestError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export interface User {
  id: string;
  email?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  aud: string;
  role?: string;
  created_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: "bearer";
  user: User;
}

export interface AuthError {
  message: string;
  name: string;
  status?: number;
}

export type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface RealtimePayload {
  eventType: Exclude<RealtimeEventType, "*">;
  schema: string;
  table: string;
  new: any;
  old: any;
}

export type RealtimeCallback = (payload: RealtimePayload) => void;

export interface RealtimeFilter {
  event: RealtimeEventType;
  schema?: string;
  table: string;
  filter?: string;
}

export interface RealtimeChannel {
  on(
    event: "postgres_changes",
    filter: RealtimeFilter,
    callback: RealtimeCallback,
  ): RealtimeChannel;
  subscribe(cb?: (status: string) => void): RealtimeChannel;
  unsubscribe(): Promise<void> | void;
}

export interface UploadOptions {
  cacheControl?: string;
  upsert?: boolean;
  contentType?: string;
}

export interface StorageBucket {
  upload(
    path: string,
    file: File | Blob | ArrayBuffer | Uint8Array | Buffer,
    options?: UploadOptions,
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  remove(
    paths: string[],
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

export interface AuthApi {
  getUser(): Promise<{ data: { user: User | null }; error: AuthError | null }>;
  getSession(): Promise<{
    data: { session: Session | null };
    error: AuthError | null;
  }>;
  signInWithPassword(creds: {
    email: string;
    password: string;
  }): Promise<{
    data: { user: User | null; session: Session | null };
    error: AuthError | null;
  }>;
  signUp(creds: {
    email: string;
    password: string;
    invite?: string;
    options?: {
      data?: Record<string, unknown>;
      emailRedirectTo?: string;
    };
  }): Promise<{
    data: { user: User | null; session: Session | null };
    error: AuthError | null;
  }>;
  signOut(opts?: { scope?: "global" | "local" }): Promise<{
    error: AuthError | null;
  }>;
  updateUser(attrs: { email?: string; password?: string }): Promise<{
    data: { user: User | null };
    error: AuthError | null;
  }>;
  resetPasswordForEmail(
    email: string,
    opts?: { redirectTo?: string },
  ): Promise<{ data: object; error: AuthError | null }>;
  onAuthStateChange(
    cb: (event: string, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe: () => void } } };
}

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "is"
  | "in"
  | "contains"
  | "overlaps";

export interface QueryFilter {
  type: "op" | "or" | "not";
  column?: string;
  op?: string;
  value?: unknown;
  raw?: string;
}

export interface OrderBy {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

export interface QuerySpec {
  table?: string;
  rpc?: string;
  rpcArgs?: Record<string, unknown>;
  op: "select" | "insert" | "update" | "upsert" | "delete" | "rpc";
  columns?: string;
  values?: unknown;
  filters: QueryFilter[];
  order: OrderBy[];
  limit?: number;
  rangeFrom?: number;
  rangeTo?: number;
  count?: "exact";
  head?: boolean;
  single?: boolean;
  maybeSingle?: boolean;
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

export interface ExecContext {
  role: "authenticated" | "service_role" | "anon";
  userId: string | null;
}

/** Drop-in stand-in for the old Supabase JS client. */
export interface SupabaseClient {
  from(table: string): import("./query-chain").QueryBuilder<any[]>;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): import("./query-chain").QueryBuilder<any>;
  auth: AuthApi;
  storage: { from(bucket: string): StorageBucket };
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): void;
}
