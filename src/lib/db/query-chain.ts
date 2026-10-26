import type { ExecContext, QueryResult, QuerySpec } from "./types";

type SelectOpts = { count?: "exact"; head?: boolean };

export class QueryBuilder<T = any[]> implements PromiseLike<QueryResult<T>> {
  private spec: QuerySpec;

  constructor(
    _ctx: ExecContext,
    init: Partial<QuerySpec> & Pick<QuerySpec, "op">,
    private readonly runner: (spec: QuerySpec) => Promise<QueryResult<T>>,
  ) {
    this.spec = {
      filters: [],
      order: [],
      columns: "*",
      ...init,
    };
  }

  select(columns = "*", opts?: SelectOpts) {
    this.spec.columns = columns;
    if (
      this.spec.op !== "insert" &&
      this.spec.op !== "update" &&
      this.spec.op !== "upsert" &&
      this.spec.op !== "delete"
    ) {
      this.spec.op = "select";
    }
    if (opts?.count) this.spec.count = opts.count;
    if (opts?.head) this.spec.head = opts.head;
    return this;
  }

  insert(values: unknown) {
    this.spec.op = "insert";
    this.spec.values = values;
    return this;
  }

  update(values: unknown) {
    this.spec.op = "update";
    this.spec.values = values;
    return this;
  }

  upsert(
    values: unknown,
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.spec.op = "upsert";
    this.spec.values = values;
    this.spec.onConflict = opts?.onConflict;
    this.spec.ignoreDuplicates = opts?.ignoreDuplicates;
    return this;
  }

  delete(opts?: { count?: "exact" }) {
    this.spec.op = "delete";
    if (opts?.count) this.spec.count = opts.count;
    return this;
  }

  eq(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "eq", value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "neq", value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "gt", value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "gte", value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "lt", value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "lte", value });
    return this;
  }
  like(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "like", value });
    return this;
  }
  ilike(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "ilike", value });
    return this;
  }
  is(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "is", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.spec.filters.push({ type: "op", column, op: "in", value });
    return this;
  }
  contains(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "contains", value });
    return this;
  }
  overlaps(column: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op: "overlaps", value });
    return this;
  }
  filter(column: string, op: string, value: unknown) {
    this.spec.filters.push({ type: "op", column, op, value });
    return this;
  }
  match(values: Record<string, unknown>) {
    for (const [column, value] of Object.entries(values)) {
      this.eq(column, value);
    }
    return this;
  }
  or(raw: string) {
    this.spec.filters.push({ type: "or", raw });
    return this;
  }
  not(column: string, op: string, value: unknown) {
    this.spec.filters.push({ type: "not", column, op, value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.spec.order.push({
      column,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }
  limit(n: number) {
    this.spec.limit = n;
    return this;
  }
  range(from: number, to: number) {
    this.spec.rangeFrom = from;
    this.spec.rangeTo = to;
    return this;
  }
  single(): QueryBuilder<T extends any[] ? T[number] : T> {
    this.spec.single = true;
    return this as unknown as QueryBuilder<T extends any[] ? T[number] : T>;
  }
  maybeSingle(): QueryBuilder<T extends any[] ? T[number] | null : T | null> {
    this.spec.maybeSingle = true;
    return this as unknown as QueryBuilder<
      T extends any[] ? T[number] | null : T | null
    >;
  }

  toSpec(): QuerySpec {
    return this.spec;
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.runner(this.spec).then(onfulfilled, onrejected);
  }
}
