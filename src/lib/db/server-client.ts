import { createServerAuth, getUserFromCookies } from "./auth-server";
import { QueryBuilder } from "./query-chain";
import { executeSpec } from "./query-builder";
import { createStorage } from "./storage";
import type { ExecContext, QuerySpec, SupabaseClient as DbClient } from "./types";

export type { DbClient as SupabaseClient };

function dummyChannel() {
  return {
    on() {
      return this;
    },
    subscribe() {
      return this;
    },
    unsubscribe() {},
  };
}

function createSurface(ctx: ExecContext) {
  const runner = (spec: QuerySpec) => executeSpec(spec, ctx);
  return {
    from(table: string) {
      return new QueryBuilder(ctx, { op: "select", table }, runner);
    },
    rpc(fn: string, args?: Record<string, unknown>) {
      return new QueryBuilder(
        ctx,
        { op: "rpc", rpc: fn, rpcArgs: args },
        runner,
      );
    },
  };
}

export async function createServerDbClient(): Promise<DbClient> {
  const user = await getUserFromCookies();
  const ctx: ExecContext = {
    role: user ? "authenticated" : "anon",
    userId: user?.id ?? null,
  };
  return {
    ...createSurface(ctx),
    auth: createServerAuth(),
    storage: createStorage(ctx),
    channel: dummyChannel,
    removeChannel() {},
  } as DbClient;
}

export function createAdminClient(): DbClient {
  const ctx: ExecContext = { role: "service_role", userId: null };
  return {
    ...createSurface(ctx),
    auth: createServerAuth(),
    storage: createStorage(ctx),
    channel: dummyChannel,
    removeChannel() {},
  } as DbClient;
}
