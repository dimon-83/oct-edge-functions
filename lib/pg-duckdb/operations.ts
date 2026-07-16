import { createJob, executeJob, listJobs, updateJobStatus } from "./jobs.ts";
import { recordLineage } from "./lineage.ts";
import { archiveJob, enqueueJob, readJobs } from "./pgmq.ts";
import { checkPgDuckdb, checkPgmq, requirePgDuckdb, requirePgmq } from "./check.ts";
import { queryDirect } from "./direct.ts";
import { queryRpc } from "./rpc.ts";
import {
  buildCleanseQuery,
  buildGovernanceQuery,
  buildSyncQuery,
} from "./rules.ts";
import type {
  CleanseOptions,
  GovernanceCheckOptions,
  GovernanceReport,
  Job,
  SqlMode,
  SyncOptions,
  ToolkitCtx,
} from "./types.ts";

function deriveName(
  prefix: string,
  source: { schema?: string; table: string },
  target: { schema?: string; table: string },
): string {
  const s = `${source.schema ?? "public"}.${source.table}`;
  const t = `${target.schema ?? "public"}.${target.table}`;
  return `${prefix}:${s}->${t}`;
}

function runQuery<T>(
  ctx: ToolkitCtx,
  mode: SqlMode,
  sql: string,
): Promise<T[]> {
  return mode === "rpc" ? queryRpc<T>(ctx, sql) : queryDirect<T>(sql);
}

async function maybeQueue(
  ctx: ToolkitCtx,
  mode: SqlMode,
  job: Job,
  queue?: boolean,
): Promise<Job> {
  if (!queue) return job;
  await requirePgmq(ctx);
  const msgId = await enqueueJob(ctx, mode, job.id);
  await updateJobStatus(ctx, mode, job.id, "pending", `queued:${msgId}`);
  return { ...job, status: "pending", pgmq_msg_id: msgId };
}

export async function sync(ctx: ToolkitCtx, options: SyncOptions): Promise<Job> {
  await requirePgDuckdb(ctx);

  const { source, target, where, mode, queue, name } = options;
  const sql = buildSyncQuery(source, target, where);
  const jobName = name ?? deriveName("sync", source, target);

  const job = await createJob(ctx, mode, {
    name: jobName,
    sourceQuery: sql,
    targetTable: `${target.schema ?? "public"}.${target.table}`,
  });

  if (!queue) {
    await executeJob(ctx, mode, job.id);
    await recordLineage(ctx, mode, {
      sources: [source],
      target,
      jobId: job.id,
      transformSummary: where ? `filtered sync: ${where}` : "full sync",
      createdBy: jobName,
    });
  }

  return maybeQueue(ctx, mode, job, queue);
}

export async function cleanse(
  ctx: ToolkitCtx,
  options: CleanseOptions,
): Promise<Job> {
  await requirePgDuckdb(ctx);

  const { source, target, rules, mode, queue, name } = options;
  const sql = buildCleanseQuery(source, target, rules);
  const jobName = name ?? deriveName("cleanse", source, target);

  const job = await createJob(ctx, mode, {
    name: jobName,
    sourceQuery: sql,
    targetTable: `${target.schema ?? "public"}.${target.table}`,
  });

  if (!queue) {
    await executeJob(ctx, mode, job.id);
    await recordLineage(ctx, mode, {
      sources: [source],
      target,
      jobId: job.id,
      transformSummary: rules.map((r) => r.type).join(", "),
      createdBy: jobName,
    });
  }

  return maybeQueue(ctx, mode, job, queue);
}

export async function governanceCheck(
  ctx: ToolkitCtx,
  options: GovernanceCheckOptions,
): Promise<GovernanceReport> {
  await requirePgDuckdb(ctx);

  const { target, rules, mode } = options;
  const report: GovernanceReport = { passed: true, violations: [] };

  for (const rule of rules) {
    try {
      const { sql, passCondition } = buildGovernanceQuery(target, rule);
      const rows = await runQuery<Record<string, unknown>>(ctx, mode, sql);

      let violated = false;
      let message = "";
      let sampleRows: unknown[] | undefined;

      if (rule.type === "not_null") {
        const count = Number((rows[0] as { violation_count: number })?.violation_count ?? 0);
        violated = count > 0;
        message = violated ? `${count} rows violate NOT NULL` : "OK";
      } else if (rule.type === "unique") {
        violated = rows.length > 0;
        message = violated ? `${rows.length} duplicate groups found` : "OK";
        sampleRows = rows.slice(0, 5);
      } else if (rule.type === "row_count_min") {
        const count = Number((rows[0] as { row_count: number })?.row_count ?? 0);
        violated = count < rule.min;
        message = violated
          ? `row count ${count} < minimum ${rule.min}`
          : `row count ${count} >= minimum ${rule.min}`;
      } else if (rule.type === "custom") {
        violated = rows.length > 0 !== passCondition;
        message = violated ? `custom rule returned unexpected result` : "OK";
        sampleRows = rows.slice(0, 5);
      }

      if (violated) {
        report.passed = false;
        report.violations.push({ rule, message, sampleRows });
      }
    } catch (err) {
      report.passed = false;
      report.violations.push({
        rule,
        message: err instanceof Error ? err.message : String(err),
      });
      report.error = {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      };
    }
  }

  return report;
}

export async function processQueuedJobs(
  ctx: ToolkitCtx,
  mode: SqlMode,
  options: { batchSize?: number } = {},
): Promise<Job[]> {
  await requirePgDuckdb(ctx);
  await requirePgmq(ctx);

  const batchSize = options.batchSize ?? 10;
  const queued = await readJobs(ctx, mode, batchSize);
  const results: Job[] = [];

  for (const item of queued) {
    try {
      const job = await executeJob(ctx, mode, item.job_id);
      results.push(job);
      await archiveJob(ctx, mode, item.msg_id);
    } catch (err) {
      await archiveJob(ctx, mode, item.msg_id);
      throw err;
    }
  }

  return results;
}

export { checkPgDuckdb, checkPgmq, listJobs, executeJob };
