import { queryDirect } from "./direct.ts";
import type { TableRef, ToolkitCtx, SqlMode } from "./types.ts";

function fullTable(name: string, schema = "public"): string {
  return `"${schema}"."${name}"`;
}

export async function recordLineage(
  ctx: ToolkitCtx,
  mode: SqlMode,
  input: {
    sources: TableRef[];
    target: TableRef;
    jobId: number;
    transformSummary?: string;
    createdBy?: string;
  },
): Promise<void> {
  const { sources, target, jobId, transformSummary, createdBy } = input;
  const targetSchema = target.schema ?? "public";
  const summary = transformSummary
    ? `'${transformSummary.replace(/'/g, "''")}'`
    : "NULL";
  const by = createdBy ? `'${createdBy.replace(/'/g, "''")}'` : "NULL";

  if (mode === "rpc") {
    const { data, error } = await ctx.db
      .from("data_lineage")
      .insert({
        target_schema: targetSchema,
        target_table: target.table,
        job_id: jobId,
        transform_summary: transformSummary ?? null,
        created_by: createdBy ?? null,
      })
      .select()
      .single();
    if (error) {
      // Non-fatal: lineage should not break the operation.
      ctx.log?.error?.("[pg-duckdb] failed to record lineage", error);
      return;
    }
    const lineageId = (data as { id: number }).id;
    const rows = sources.map((s) => ({
      lineage_id: lineageId,
      source_schema: s.schema ?? "public",
      source_table: s.table,
    }));
    const { error: sourceError } = await ctx.db
      .from("data_lineage_sources")
      .insert(rows);
    if (sourceError) {
      ctx.log?.error?.("[pg-duckdb] failed to record lineage sources", sourceError);
    }
    return;
  }

  try {
    const lineageResult = await queryDirect<{ id: number }>(
      `INSERT INTO ${fullTable("data_lineage")}
         (target_schema, target_table, job_id, transform_summary, created_by)
       VALUES ('${targetSchema}', '${target.table}', ${jobId}, ${summary}, ${by})
       RETURNING id;`,
    );
    const lineageId = lineageResult[0]?.id;
    if (!lineageId) return;

    const values = sources
      .map(
        (s) =>
          `(${lineageId}, '${s.schema ?? "public"}', '${s.table}')`,
      )
      .join(", ");
    if (values) {
      await queryDirect(
        `INSERT INTO ${fullTable("data_lineage_sources")}
           (lineage_id, source_schema, source_table)
         VALUES ${values};`,
      );
    }
  } catch (err) {
    console.error("[pg-duckdb] failed to record lineage", err);
  }
}
