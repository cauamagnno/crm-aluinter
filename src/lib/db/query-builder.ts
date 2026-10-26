import type { PoolClient } from "pg";

import { withContext } from "./pool";
import type {
  ExecContext,
  OrderBy,
  PostgrestError,
  QueryFilter,
  QueryResult,
  QuerySpec,
} from "./types";

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const JSON_PATH = /^([a-zA-Z_][a-zA-Z0-9_]*)->>+([a-zA-Z_][a-zA-Z0-9_]*)$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pgError(err: unknown): PostgrestError {
  const e = err as {
    message?: string;
    detail?: string;
    hint?: string;
    code?: string;
  };
  return {
    message: e.message ?? "Database error",
    details: e.detail ?? "",
    hint: e.hint ?? "",
    code: e.code ?? "XX000",
  };
}

function emptyResult(error: PostgrestError | null = null): QueryResult {
  return {
    data: null,
    error,
    count: null,
    status: error ? 400 : 200,
    statusText: error ? "error" : "OK",
  };
}

function quoteIdent(name: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function quoteColumn(expr: string): string {
  const trimmed = expr.trim();
  const json = trimmed.match(JSON_PATH);
  if (json) {
    return `${quoteIdent(json[1])}->>'${json[2]}'`;
  }
  if (IDENT.test(trimmed)) return quoteIdent(trimmed);
  throw new Error(`Invalid column: ${expr}`);
}

interface Embed {
  alias: string;
  table: string;
  columns: string;
  inner: boolean;
  hint: string | null;
}

function splitTopLevel(input: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function parseSelect(columns: string): { locals: string[]; embeds: Embed[] } {
  const locals: string[] = [];
  const embeds: Embed[] = [];
  for (const part of splitTopLevel(columns || "*")) {
    const embed = part.match(
      /^(?:([a-zA-Z_][a-zA-Z0-9_]*):)?([a-zA-Z_][a-zA-Z0-9_]*)(?:!([a-zA-Z_][a-zA-Z0-9_]*))?(?:!inner)?\((.*)\)$/,
    );
    if (embed) {
      const inner = part.includes("!inner");
      embeds.push({
        alias: embed[1] || embed[2],
        table: embed[2],
        columns: embed[4] || "*",
        inner,
        hint: embed[3] && embed[3] !== "inner" ? embed[3] : null,
      });
      continue;
    }
    locals.push(part);
  }
  return { locals: locals.length ? locals : ["*"], embeds };
}

interface FkRow {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

const fkCache = new Map<string, FkRow[]>();

async function loadFks(client: PoolClient, table: string): Promise<FkRow[]> {
  const cached = fkCache.get(table);
  if (cached) return cached;
  const { rows } = await client.query<FkRow>(
    `SELECT
       tc.constraint_name,
       tc.table_name AS source_table,
       kcu.column_name AS source_column,
       ccu.table_name AS target_table,
       ccu.column_name AS target_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND (tc.table_name = $1 OR ccu.table_name = $1)`,
    [table],
  );
  fkCache.set(table, rows);
  return rows;
}

function resolveFk(
  fks: FkRow[],
  fromTable: string,
  embed: Embed,
): { manyToOne: boolean; localCol: string; foreignCol: string } | null {
  const hinted = embed.hint
    ? fks.find((f) => f.constraint_name === embed.hint)
    : undefined;
  const outgoing =
    hinted && hinted.source_table === fromTable
      ? hinted
      : fks.find(
          (f) => f.source_table === fromTable && f.target_table === embed.table,
        );
  if (outgoing) {
    return {
      manyToOne: true,
      localCol: outgoing.source_column,
      foreignCol: outgoing.target_column,
    };
  }
  const incoming = fks.find(
    (f) => f.source_table === embed.table && f.target_table === fromTable,
  );
  if (incoming) {
    return {
      manyToOne: false,
      localCol: incoming.target_column,
      foreignCol: incoming.source_column,
    };
  }
  return null;
}

function parseOr(expr: string, params: unknown[]): string {
  const parts = splitTopLevel(expr);
  const clauses = parts.map((part) => {
    const andMatch = part.match(/^and\((.*)\)$/);
    if (andMatch) {
      const inner = splitTopLevel(andMatch[1])
        .map((p) => parsePredicate(p, params))
        .join(" AND ");
      return `(${inner})`;
    }
    return parsePredicate(part, params);
  });
  return `(${clauses.join(" OR ")})`;
}

function parsePredicate(raw: string, params: unknown[]): string {
  const m = raw.match(
    /^([a-zA-Z_][a-zA-Z0-9_]*?)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/,
  );
  if (!m) throw new Error(`Invalid or() predicate: ${raw}`);
  return applyOp(m[1], m[2], decodeOrValue(m[2], m[3]), params);
}

function decodeOrValue(op: string, raw: string): unknown {
  if (op === "is" && raw === "null") return null;
  if (op === "in") {
    const inner = raw.replace(/^\(|\)$/g, "");
    return inner.split(",").map((s) => s.trim());
  }
  return raw;
}

function applyOp(
  column: string,
  op: string,
  value: unknown,
  params: unknown[],
): string {
  const col = quoteColumn(column);
  if (op === "is") {
    if (value === null || value === "null") return `${col} IS NULL`;
    if (value === true || value === "true") return `${col} IS TRUE`;
    if (value === false || value === "false") return `${col} IS FALSE`;
    return `${col} IS NULL`;
  }
  if (op === "in") {
    const list = Array.isArray(value) ? value : [];
    if (list.length === 0) return "FALSE";
    const marks = list.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `${col} IN (${marks.join(", ")})`;
  }
  if (op === "contains") {
    params.push(Array.isArray(value) ? value : [value]);
    return `${col} @> $${params.length}`;
  }
  if (op === "overlaps") {
    params.push(value);
    return `${col} && $${params.length}`;
  }
  const sqlOp: Record<string, string> = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    like: "LIKE",
    ilike: "ILIKE",
  };
  const operator = sqlOp[op];
  if (!operator) throw new Error(`Unsupported operator: ${op}`);
  params.push(value);
  return `${col} ${operator} $${params.length}`;
}

function whereSql(filters: QueryFilter[], params: unknown[]): string {
  if (!filters.length) return "";
  const parts = filters.map((f) => {
    if (f.type === "or" && f.raw) return parseOr(f.raw, params);
    if (f.type === "not" && f.column && f.op) {
      return `NOT (${applyOp(f.column, f.op, f.value, params)})`;
    }
    if (f.column && f.op) return applyOp(f.column, f.op, f.value, params);
    throw new Error("Invalid filter");
  });
  return ` WHERE ${parts.join(" AND ")}`;
}

function orderSql(order: OrderBy[]): string {
  if (!order.length) return "";
  return (
    " ORDER BY " +
    order
      .map((o) => {
        const dir = o.ascending ? "ASC" : "DESC";
        const nulls =
          o.nullsFirst === undefined
            ? ""
            : o.nullsFirst
              ? " NULLS FIRST"
              : " NULLS LAST";
        return `${quoteColumn(o.column)} ${dir}${nulls}`;
      })
      .join(", ")
  );
}

function jsonParam(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    if (value.length && (Array.isArray(value[0]) || typeof value[0] === "object")) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    return JSON.stringify(value);
  }
  return value;
}

function valuePlaceholder(value: unknown, params: unknown[]): string {
  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  ) {
    params.push(JSON.stringify(value));
    return `$${params.length}::jsonb`;
  }
  if (Array.isArray(value) && value.length && typeof value[0] === "object") {
    params.push(JSON.stringify(value));
    return `$${params.length}::jsonb`;
  }
  params.push(jsonParam(value));
  return `$${params.length}`;
}

function rpcArgSql(name: string, idx: number, value: unknown): string {
  const ident = quoteIdent(name);
  if (Array.isArray(value)) {
    if (!value.length) return `${ident} := $${idx}::uuid[]`;
    if (typeof value[0] === "string" && UUID_RE.test(value[0])) {
      return `${ident} := $${idx}::uuid[]`;
    }
    if (typeof value[0] === "object") {
      return `${ident} := ARRAY(SELECT jsonb_array_elements($${idx}::jsonb))`;
    }
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value)) {
    return `${ident} := $${idx}::jsonb`;
  }
  return `${ident} := $${idx}`;
}

async function hydrateEmbeds(
  client: PoolClient,
  table: string,
  rows: Record<string, unknown>[],
  embeds: Embed[],
): Promise<Record<string, unknown>[]> {
  if (!embeds.length || !rows.length) return rows;
  const fks = await loadFks(client, table);
  let current = rows;
  for (const embed of embeds) {
    const fk = resolveFk(fks, table, embed);
    if (!fk) continue;
    const ids = [
      ...new Set(
        current
          .map((r) => r[fk.manyToOne ? fk.localCol : fk.localCol])
          .filter((v) => v != null),
      ),
    ];
    const parsed = parseSelect(embed.columns);
    const related = ids.length
      ? await selectRows(client, {
          table: embed.table,
          op: "select",
          columns: parsed.locals.join(", "),
          filters: [
            {
              type: "op",
              column: fk.manyToOne ? fk.foreignCol : fk.foreignCol,
              op: "in",
              value: ids,
            },
          ],
          order: [],
        })
      : [];
    const nested = parsed.embeds.length
      ? await hydrateEmbeds(client, embed.table, related, parsed.embeds)
      : related;

    if (fk.manyToOne) {
      const byId = new Map(nested.map((r) => [String(r[fk.foreignCol]), r]));
      current = current
        .map((row) => ({
          ...row,
          [embed.alias]: byId.get(String(row[fk.localCol])) ?? null,
        }))
        .filter((row) => !embed.inner || row[embed.alias] != null);
    } else {
      const groups = new Map<string, Record<string, unknown>[]>();
      for (const rel of nested) {
        const key = String(rel[fk.foreignCol]);
        const list = groups.get(key) ?? [];
        list.push(rel);
        groups.set(key, list);
      }
      current = current.map((row) => ({
        ...row,
        [embed.alias]: groups.get(String(row[fk.localCol])) ?? [],
      }));
    }
  }
  return current;
}

async function selectRows(
  client: PoolClient,
  spec: QuerySpec,
): Promise<Record<string, unknown>[]> {
  const table = spec.table!;
  const parsed = parseSelect(spec.columns || "*");
  const params: unknown[] = [];
  const cols = parsed.locals.includes("*")
    ? "*"
    : parsed.locals.map(quoteColumn).join(", ");
  let sql = `SELECT ${cols} FROM ${quoteIdent(table)}`;
  sql += whereSql(spec.filters, params);
  sql += orderSql(spec.order);
  if (spec.rangeFrom != null && spec.rangeTo != null) {
    sql += ` LIMIT ${spec.rangeTo - spec.rangeFrom + 1} OFFSET ${spec.rangeFrom}`;
  } else if (spec.limit != null) {
    sql += ` LIMIT ${Number(spec.limit)}`;
  }
  const { rows } = await client.query(sql, params);
  return hydrateEmbeds(client, table, rows as Record<string, unknown>[], parsed.embeds);
}

async function countRows(client: PoolClient, spec: QuerySpec): Promise<number> {
  const params: unknown[] = [];
  const sql = `SELECT COUNT(*)::int AS c FROM ${quoteIdent(spec.table!)}${whereSql(spec.filters, params)}`;
  const { rows } = await client.query<{ c: number }>(sql, params);
  return rows[0]?.c ?? 0;
}

function returningSql(spec: QuerySpec): string {
  if (spec.head) return "";
  if (!spec.columns || spec.columns === "*") return " RETURNING *";
  const parsed = parseSelect(spec.columns);
  if (parsed.locals.includes("*")) return " RETURNING *";
  return ` RETURNING ${parsed.locals.map(quoteColumn).join(", ")}`;
}

async function executeOn(client: PoolClient, spec: QuerySpec): Promise<QueryResult> {
  if (spec.op === "rpc" || spec.rpc) {
    const fn = spec.rpc!;
    if (!IDENT.test(fn)) throw new Error(`Invalid rpc: ${fn}`);
    const entries = Object.entries(spec.rpcArgs ?? {});
    const params = entries.map(([, v]) => jsonParam(v));
    const args = entries
      .map(([k, v], i) => rpcArgSql(k, i + 1, v))
      .join(", ");
    const sql = `SELECT * FROM ${quoteIdent(fn)}(${args})`;
    const result = await client.query(sql, params);
    const rows = result.rows;
    let data: unknown = rows;
    if (rows.length === 1) {
      const keys = Object.keys(rows[0] as object);
      if (keys.length === 1 && keys[0] === fn) {
        data = (rows[0] as Record<string, unknown>)[fn];
      } else if (keys.length === 1) {
        data = (rows[0] as Record<string, unknown>)[keys[0]];
      }
    }
    return { data, error: null, count: rows.length, status: 200, statusText: "OK" };
  }

  if (spec.op === "select") {
    const count = spec.count ? await countRows(client, spec) : null;
    if (spec.head) {
      return { data: null, error: null, count, status: 200, statusText: "OK" };
    }
    const rows = await selectRows(client, spec);
    if (spec.single) {
      if (rows.length !== 1) {
        return emptyResult({
          message:
            rows.length === 0
              ? "JSON object requested, multiple (or no) rows returned"
              : "Multiple rows returned",
          details: "",
          hint: "",
          code: "PGRST116",
        });
      }
      return { data: rows[0], error: null, count, status: 200, statusText: "OK" };
    }
    if (spec.maybeSingle) {
      if (rows.length > 1) {
        return emptyResult({
          message: "Multiple rows returned",
          details: "",
          hint: "",
          code: "PGRST116",
        });
      }
      return {
        data: rows[0] ?? null,
        error: null,
        count,
        status: 200,
        statusText: "OK",
      };
    }
    return { data: rows, error: null, count, status: 200, statusText: "OK" };
  }

  const table = quoteIdent(spec.table!);
  const params: unknown[] = [];

  if (spec.op === "insert" || spec.op === "upsert") {
    const rows = Array.isArray(spec.values) ? spec.values : [spec.values];
    if (!rows.length || !rows[0] || typeof rows[0] !== "object") {
      return emptyResult({
        message: "No rows to insert",
        details: "",
        hint: "",
        code: "400",
      });
    }
    const keys = Object.keys(rows[0] as object);
    const cols = keys.map(quoteIdent).join(", ");
    const valuesSql = rows
      .map((row) => {
        const rec = row as Record<string, unknown>;
        const marks = keys.map((k) => valuePlaceholder(rec[k], params));
        return `(${marks.join(", ")})`;
      })
      .join(", ");
    let sql = `INSERT INTO ${table} (${cols}) VALUES ${valuesSql}`;
    if (spec.op === "upsert" && spec.onConflict) {
      const conflictCols = spec.onConflict
        .split(",")
        .map((c) => quoteIdent(c.trim()))
        .join(", ");
      if (spec.ignoreDuplicates) {
        sql += ` ON CONFLICT (${conflictCols}) DO NOTHING`;
      } else {
        const updates = keys
          .filter((k) => !spec.onConflict!.split(",").map((c) => c.trim()).includes(k))
          .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
          .join(", ");
        sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updates || keys.map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`).join(", ")}`;
      }
    }
    sql += returningSql(spec);
    const result = await client.query(sql, params);
    const parsed = parseSelect(spec.columns || "*");
    let data: unknown = result.rows;
    if (parsed.embeds.length && result.rows.length) {
      data = await hydrateEmbeds(
        client,
        spec.table!,
        result.rows as Record<string, unknown>[],
        parsed.embeds,
      );
    }
    if (spec.single || spec.maybeSingle) {
      data = (data as unknown[])[0] ?? null;
    }
    return {
      data: spec.head ? null : data,
      error: null,
      count: result.rowCount,
      status: 201,
      statusText: "Created",
    };
  }

  if (spec.op === "update") {
    const rec = (spec.values ?? {}) as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (!keys.length) {
      return emptyResult({
        message: "No columns to update",
        details: "",
        hint: "",
        code: "400",
      });
    }
    const sets = keys.map((k) => {
      return `${quoteIdent(k)} = ${valuePlaceholder(rec[k], params)}`;
    });
    let sql = `UPDATE ${table} SET ${sets.join(", ")}`;
    sql += whereSql(spec.filters, params);
    sql += returningSql(spec);
    const result = await client.query(sql, params);
    let data: unknown = result.rows;
    const parsed = parseSelect(spec.columns || "*");
    if (parsed.embeds.length && result.rows.length) {
      data = await hydrateEmbeds(
        client,
        spec.table!,
        result.rows as Record<string, unknown>[],
        parsed.embeds,
      );
    }
    if (spec.single || spec.maybeSingle) {
      data = (data as unknown[])[0] ?? null;
    }
    return {
      data: spec.columns || spec.single || spec.maybeSingle ? data : spec.head ? null : data,
      error: null,
      count: result.rowCount,
      status: 200,
      statusText: "OK",
    };
  }

  if (spec.op === "delete") {
    let sql = `DELETE FROM ${table}`;
    sql += whereSql(spec.filters, params);
    sql += returningSql(spec);
    const result = await client.query(sql, params);
    let data: unknown = result.rows;
    if (spec.single || spec.maybeSingle) {
      data = result.rows[0] ?? null;
    }
    return {
      data: spec.columns ? data : spec.head ? null : data,
      error: null,
      count: result.rowCount,
      status: 200,
      statusText: "OK",
    };
  }

  return emptyResult({
    message: `Unknown op ${spec.op}`,
    details: "",
    hint: "",
    code: "400",
  });
}

export async function executeSpec(
  spec: QuerySpec,
  ctx: ExecContext,
): Promise<QueryResult> {
  try {
    return await withContext(ctx, (client) => executeOn(client, spec));
  } catch (err) {
    return emptyResult(pgError(err));
  }
}

export { QueryBuilder } from "./query-chain";
