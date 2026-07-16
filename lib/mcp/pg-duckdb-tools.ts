import { createClient } from "../db.ts";
import * as pgDuckdb from "../pg-duckdb/mod.ts";
import type { Ctx } from "../context.ts";
import type { ToolRegistry } from "./registry.ts";
import type { ToolResult } from "./types.ts";

function createToolkitCtx(): Ctx & { db: NonNullable<Ctx["db"]> } {
  const pgrestJwt = Deno.env.get("PGREST_JWT");
  if (!pgrestJwt) {
    throw new Error("PGREST_JWT is required for pg-duckdb MCP tools");
  }
  return {
    db: createClient(pgrestJwt),
    log: console,
  } as Ctx & { db: NonNullable<Ctx["db"]> };
}

function ok(data: unknown): ToolResult {
  return { success: true, data };
}

function err(code: string, message: string, context?: unknown): ToolResult {
  return { success: false, error: { code, message, context } };
}

export function registerPgDuckdbTools(registry: ToolRegistry): void {
  registry.register({
    name: "pg_duckdb_check",
    description: "Verify pg_duckdb and optional pgmq extensions are installed",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      try {
        const ctx = createToolkitCtx();
        const duckdb = await pgDuckdb.checkPgDuckdb(ctx);
        const pgmq = await pgDuckdb.checkPgmq(ctx);
        return ok({ pg_duckdb: duckdb, pgmq });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("CHECK_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_ensure_schema",
    description: "Initialize pg-duckdb Toolkit metadata tables",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      try {
        const ctx = createToolkitCtx();
        await pgDuckdb.ensureSchema(ctx);
        return ok({ initialized: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("SCHEMA_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_sync",
    description: "Create a DuckDB synchronization job",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rpc", "direct"] },
        source_schema: { type: "string" },
        source_table: { type: "string" },
        target_schema: { type: "string" },
        target_table: { type: "string" },
        where: { type: "string" },
        queue: { type: "boolean" },
        name: { type: "string" },
      },
      required: ["mode", "source_table", "target_table"],
    },
    handler: async (a) => {
      try {
        const ctx = createToolkitCtx();
        const job = await pgDuckdb.sync(ctx, {
          mode: a.mode as "rpc" | "direct",
          source: { schema: a.source_schema as string, table: a.source_table as string },
          target: { schema: a.target_schema as string, table: a.target_table as string },
          where: a.where as string | undefined,
          queue: a.queue as boolean | undefined,
          name: a.name as string | undefined,
        });
        return ok({ job });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("SYNC_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_cleanse",
    description: "Create a DuckDB data-cleansing job",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rpc", "direct"] },
        source_schema: { type: "string" },
        source_table: { type: "string" },
        target_schema: { type: "string" },
        target_table: { type: "string" },
        rules: { type: "array" },
        queue: { type: "boolean" },
        name: { type: "string" },
      },
      required: ["mode", "source_table", "target_table", "rules"],
    },
    handler: async (a) => {
      try {
        const ctx = createToolkitCtx();
        const job = await pgDuckdb.cleanse(ctx, {
          mode: a.mode as "rpc" | "direct",
          source: { schema: a.source_schema as string, table: a.source_table as string },
          target: { schema: a.target_schema as string, table: a.target_table as string },
          rules: a.rules as pgDuckdb.CleanseRule[],
          queue: a.queue as boolean | undefined,
          name: a.name as string | undefined,
        });
        return ok({ job });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("CLEANSE_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_governance_check",
    description: "Run governance checks against a DuckDB table",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rpc", "direct"] },
        target_schema: { type: "string" },
        target_table: { type: "string" },
        rules: { type: "array" },
      },
      required: ["mode", "target_table", "rules"],
    },
    handler: async (a) => {
      try {
        const ctx = createToolkitCtx();
        const report = await pgDuckdb.governanceCheck(ctx, {
          mode: a.mode as "rpc" | "direct",
          target: { schema: a.target_schema as string, table: a.target_table as string },
          rules: a.rules as pgDuckdb.GovernanceRule[],
        });
        return ok({ report });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("GOVERNANCE_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_list_jobs",
    description: "List recent DuckDB jobs and their statuses",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rpc", "direct"] },
        status: { type: "string" },
        limit: { type: "number" },
      },
      required: ["mode"],
    },
    handler: async (a) => {
      try {
        const ctx = createToolkitCtx();
        const jobs = await pgDuckdb.listJobs(ctx, a.mode as "rpc" | "direct", {
          status: a.status as pgDuckdb.JobStatus | undefined,
          limit: a.limit as number | undefined,
        });
        return ok({ jobs });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("LIST_JOBS_FAILED", msg);
      }
    },
  });

  registry.register({
    name: "pg_duckdb_process_queue",
    description: "Consume queued DuckDB jobs from pgmq",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["rpc", "direct"] },
        batch_size: { type: "number" },
      },
      required: ["mode"],
    },
    handler: async (a) => {
      try {
        const ctx = createToolkitCtx();
        const jobs = await pgDuckdb.processQueuedJobs(
          ctx,
          a.mode as "rpc" | "direct",
          { batchSize: a.batch_size as number | undefined },
        );
        return ok({ jobs });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return err("PROCESS_QUEUE_FAILED", msg);
      }
    },
  });
}
