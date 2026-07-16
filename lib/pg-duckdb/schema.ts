import { PgDuckdbError } from "./errors.ts";
import type { ToolkitCtx } from "./types.ts";

export const SCHEMA_TABLES = [
  `CREATE TABLE IF NOT EXISTS duckdb_jobs (
    id bigserial PRIMARY KEY,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    source_query text NOT NULL,
    target_table text,
    started_at timestamptz,
    finished_at timestamptz,
    error_message text,
    pgmq_msg_id bigint
  );`,
  `CREATE TABLE IF NOT EXISTS duckdb_job_logs (
    id bigserial PRIMARY KEY,
    job_id bigint NOT NULL REFERENCES duckdb_jobs(id) ON DELETE CASCADE,
    status text NOT NULL,
    message text,
    logged_at timestamptz NOT NULL DEFAULT now()
  );`,
  `CREATE TABLE IF NOT EXISTS data_lineage (
    id bigserial PRIMARY KEY,
    target_schema text NOT NULL,
    target_table text NOT NULL,
    job_id bigint REFERENCES duckdb_jobs(id) ON DELETE SET NULL,
    transform_summary text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text
  );`,
  `CREATE TABLE IF NOT EXISTS data_lineage_sources (
    lineage_id bigint NOT NULL REFERENCES data_lineage(id) ON DELETE CASCADE,
    source_schema text NOT NULL,
    source_table text NOT NULL,
    PRIMARY KEY (lineage_id, source_schema, source_table)
  );`,
];

export async function ensureSchema(ctx: ToolkitCtx): Promise<void> {
  for (const sql of SCHEMA_TABLES) {
    const { error } = await ctx.db.rpc("exec_sql", { sql });
    if (error) {
      throw new PgDuckdbError(
        `Failed to ensure pg-duckdb schema: ${error.message}`,
        "OPERATION_FAILED",
        error,
      );
    }
  }
}

export async function ensureSchemaDirect(
  sqlExecutor: (sql: string) => Promise<unknown>,
): Promise<void> {
  for (const sql of SCHEMA_TABLES) {
    try {
      await sqlExecutor(sql);
    } catch (err) {
      throw new PgDuckdbError(
        `Failed to ensure pg-duckdb schema: ${
          err instanceof Error ? err.message : String(err)
        }`,
        "OPERATION_FAILED",
        err,
      );
    }
  }
}
