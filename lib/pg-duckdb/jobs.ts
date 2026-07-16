import { PgDuckdbError } from "./errors.ts";
import { queryDirect } from "./direct.ts";
import { queryRpc } from "./rpc.ts";
import type { Job, JobStatus, SqlMode, ToolkitCtx } from "./types.ts";

function fullTable(name: string, schema = "public"): string {
  return `"${schema}"."${name}"`;
}

function nowSql(): string {
  return "now()";
}

export async function createJob(
  ctx: ToolkitCtx,
  mode: SqlMode,
  input: {
    name: string;
    sourceQuery: string;
    targetTable?: string;
  },
): Promise<Job> {
  const { name, sourceQuery, targetTable } = input;

  if (mode === "rpc") {
    const { data, error } = await ctx.db
      .from("duckdb_jobs")
      .insert({ name, source_query: sourceQuery, target_table: targetTable })
      .select()
      .single();
    if (error) {
      throw new PgDuckdbError(
        `Failed to create job: ${error.message}`,
        "OPERATION_FAILED",
        error,
      );
    }
    return data as Job;
  }

  const result = await queryDirect<Job>(
    `INSERT INTO ${fullTable("duckdb_jobs")} (name, source_query, target_table)
     VALUES ('${name}', '${sourceQuery.replace(/'/g, "''")}', ${
      targetTable ? `'${targetTable.replace(/'/g, "''")}'` : "NULL"
    })
     RETURNING *;`,
  );
  return result[0];
}

export async function updateJobStatus(
  ctx: ToolkitCtx,
  mode: SqlMode,
  jobId: number,
  status: JobStatus,
  message?: string,
): Promise<void> {
  const finishedAt = status === "running" ? "NULL" : nowSql();
  const errorCol = message
    ? `'${message.replace(/'/g, "''")}'`
    : "NULL";

  if (mode === "rpc") {
    const { error } = await ctx.db
      .from("duckdb_jobs")
      .update({
        status,
        finished_at: status === "running" ? null : new Date().toISOString(),
        error_message: message ?? null,
      })
      .eq("id", jobId);
    if (error) {
      throw new PgDuckdbError(
        `Failed to update job status: ${error.message}`,
        "OPERATION_FAILED",
        error,
      );
    }
  } else {
    await queryDirect(
      `UPDATE ${fullTable("duckdb_jobs")}
       SET status = '${status}',
           finished_at = ${finishedAt},
           error_message = ${errorCol}
       WHERE id = ${jobId};`,
    );
  }

  await logJobStatus(ctx, mode, jobId, status, message);
}

export async function logJobStatus(
  ctx: ToolkitCtx,
  mode: SqlMode,
  jobId: number,
  status: JobStatus,
  message?: string,
): Promise<void> {
  const msg = message ? `'${message.replace(/'/g, "''")}'` : "NULL";

  if (mode === "rpc") {
    const { error } = await ctx.db.from("duckdb_job_logs").insert({
      job_id: jobId,
      status,
      message: message ?? null,
    });
    if (error) {
      // Non-fatal: log failure should not break the job flow.
      ctx.log?.error?.("[pg-duckdb] failed to write job log", error);
    }
  } else {
    try {
      await queryDirect(
        `INSERT INTO ${fullTable("duckdb_job_logs")} (job_id, status, message)
         VALUES (${jobId}, '${status}', ${msg});`,
      );
    } catch (err) {
      // Non-fatal.
      console.error("[pg-duckdb] failed to write job log", err);
    }
  }
}

export async function getJob(
  ctx: ToolkitCtx,
  mode: SqlMode,
  jobId: number,
): Promise<Job | null> {
  if (mode === "rpc") {
    const { data, error } = await ctx.db
      .from("duckdb_jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      throw new PgDuckdbError(
        `Failed to get job: ${error.message}`,
        "OPERATION_FAILED",
        error,
      );
    }
    return data as Job;
  }

  const result = await queryDirect<Job>(
    `SELECT * FROM ${fullTable("duckdb_jobs")} WHERE id = ${jobId};`,
  );
  return result[0] ?? null;
}

export async function listJobs(
  ctx: ToolkitCtx,
  mode: SqlMode,
  options: { status?: JobStatus; limit?: number } = {},
): Promise<Job[]> {
  const limit = options.limit ?? 100;

  if (mode === "rpc") {
    let q = ctx.db.from("duckdb_jobs").select("*").order("id", {
      ascending: false,
    }).limit(limit);
    if (options.status) {
      q = q.eq("status", options.status);
    }
    const { data, error } = await q;
    if (error) {
      throw new PgDuckdbError(
        `Failed to list jobs: ${error.message}`,
        "OPERATION_FAILED",
        error,
      );
    }
    return (data ?? []) as Job[];
  }

  const where = options.status ? `WHERE status = '${options.status}'` : "";
  return await queryDirect<Job>(
    `SELECT * FROM ${fullTable("duckdb_jobs")} ${where}
     ORDER BY id DESC LIMIT ${limit};`,
  );
}

export async function executeJob(
  ctx: ToolkitCtx,
  mode: SqlMode,
  jobId: number,
): Promise<Job> {
  const job = await getJob(ctx, mode, jobId);
  if (!job) {
    throw new PgDuckdbError(`Job ${jobId} not found`, "JOB_NOT_FOUND");
  }

  await updateJobStatus(ctx, mode, jobId, "running");

  try {
    if (mode === "rpc") {
      await queryRpc(ctx, job.source_query);
    } else {
      await queryDirect(job.source_query);
    }
    await updateJobStatus(ctx, mode, jobId, "succeeded");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJobStatus(ctx, mode, jobId, "failed", message);
    throw err;
  }

  const updated = await getJob(ctx, mode, jobId);
  return updated!;
}
