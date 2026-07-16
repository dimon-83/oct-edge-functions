import { PgDuckdbError } from "./errors.ts";
import { queryDirect } from "./direct.ts";
import type { SqlMode, ToolkitCtx } from "./types.ts";

const QUEUE_NAME = "duckdb_jobs";

export interface QueuedJob {
  msg_id: number;
  job_id: number;
}

export async function enqueueJob(
  ctx: ToolkitCtx,
  mode: SqlMode,
  jobId: number,
): Promise<number> {
  if (mode === "rpc") {
    const { data, error } = await ctx.db.rpc("pgmq_send", {
      queue_name: QUEUE_NAME,
      payload: { job_id: jobId },
    });
    if (error) {
      throw new PgDuckdbError(
        `Failed to enqueue job: ${error.message}`,
        "PGMQ_MISSING",
        error,
      );
    }
    return data as number;
  }

  const result = await queryDirect<{ send: number }>(
    `SELECT pgmq.send('${QUEUE_NAME}', '{"job_id": ${jobId}}'::jsonb) AS send;`,
  );
  return result[0]?.send;
}

export async function readJobs(
  ctx: ToolkitCtx,
  mode: SqlMode,
  count = 1,
): Promise<QueuedJob[]> {
  if (mode === "rpc") {
    const { data, error } = await ctx.db.rpc("pgmq_read", {
      queue_name: QUEUE_NAME,
      vt: 60,
      count,
    });
    if (error) {
      throw new PgDuckdbError(
        `Failed to read queued jobs: ${error.message}`,
        "PGMQ_MISSING",
        error,
      );
    }
    return (data as Array<{ msg_id: number; message: { job_id: number } }>)
      .map((row) => ({ msg_id: row.msg_id, job_id: row.message.job_id }));
  }

  const result = await queryDirect<
    { msg_id: number; message: { job_id: number } }
  >(
    `SELECT msg_id, message FROM pgmq.read('${QUEUE_NAME}', 60, ${count});`,
  );
  return result.map((row) => ({ msg_id: row.msg_id, job_id: row.message.job_id }));
}

export async function archiveJob(
  ctx: ToolkitCtx,
  mode: SqlMode,
  msgId: number,
): Promise<void> {
  if (mode === "rpc") {
    const { error } = await ctx.db.rpc("pgmq_archive", {
      queue_name: QUEUE_NAME,
      msg_id: msgId,
    });
    if (error) {
      throw new PgDuckdbError(
        `Failed to archive queued job: ${error.message}`,
        "PGMQ_MISSING",
        error,
      );
    }
    return;
  }

  await queryDirect(
    `SELECT pgmq.archive('${QUEUE_NAME}', ${msgId});`,
  );
}
