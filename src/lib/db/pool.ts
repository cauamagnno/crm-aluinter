import { Pool, type PoolClient } from "pg";

import type { ExecContext } from "./types";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString: url,
      max: 10,
    });
  }
  return pool;
}

export async function withContext<T>(
  ctx: ExecContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      ctx.userId ?? "",
    ]);
    await client.query("SELECT set_config('request.jwt.claim.role', $1, true)", [
      ctx.role,
    ]);
    if (ctx.role === "service_role") {
      await client.query("SET LOCAL ROLE service_role");
    } else if (ctx.role === "authenticated") {
      await client.query("SET LOCAL ROLE authenticated");
    } else {
      await client.query("SET LOCAL ROLE anon");
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function withAdmin<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
