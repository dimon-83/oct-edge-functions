import { PgDuckdbError } from "./errors.ts";
import type { ToolkitCtx } from "./types.ts";

export async function checkPgDuckdb(ctx: ToolkitCtx): Promise<boolean> {
  const { data, error } = await ctx.db.rpc("check_extension", {
    name: "pg_duckdb",
  });
  if (error) {
    throw new PgDuckdbError(
      `Failed to check pg_duckdb extension: ${error.message}`,
      "RPC_FAILED",
      error,
    );
  }
  return data === true;
}

export async function checkPgmq(ctx: ToolkitCtx): Promise<boolean> {
  const { data, error } = await ctx.db.rpc("check_extension", {
    name: "pgmq",
  });
  if (error) {
    throw new PgDuckdbError(
      `Failed to check pgmq extension: ${error.message}`,
      "RPC_FAILED",
      error,
    );
  }
  return data === true;
}

export async function requirePgDuckdb(ctx: ToolkitCtx): Promise<void> {
  const installed = await checkPgDuckdb(ctx);
  if (!installed) {
    throw new PgDuckdbError(
      "pg_duckdb extension is not installed in the target database",
      "EXTENSION_MISSING",
    );
  }
}

export async function requirePgmq(ctx: ToolkitCtx): Promise<void> {
  const installed = await checkPgmq(ctx);
  if (!installed) {
    throw new PgDuckdbError(
      "pgmq extension is required for queued jobs but is not installed",
      "PGMQ_MISSING",
    );
  }
}
