import { PgDuckdbError } from "./errors.ts";
import type { ToolkitCtx } from "./types.ts";

export async function queryRpc<T = unknown>(
  ctx: ToolkitCtx,
  sql: string,
): Promise<T[]> {
  const { data, error } = await ctx.db.rpc("duckdb_query", { sql });
  if (error) {
    throw new PgDuckdbError(
      `DuckDB RPC query failed: ${error.message}`,
      "RPC_FAILED",
      error,
    );
  }
  return (data ?? []) as T[];
}
