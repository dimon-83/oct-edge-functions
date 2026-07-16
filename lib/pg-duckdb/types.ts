import type { Ctx } from "../context.ts";

export type SqlMode = "rpc" | "direct";

export interface TableRef {
  schema?: string;
  table: string;
}

export interface DirectSqlOptions {
  url?: string;
  schema?: string;
}

export type CleanseRule =
  | { type: "deduplicate"; columns: string[] }
  | { type: "remove_nulls"; columns: string[] }
  | { type: "clamp"; column: string; min: number; max: number }
  | { type: "custom"; sql: string };

export type GovernanceRule =
  | { type: "not_null"; columns: string[] }
  | { type: "unique"; columns: string[] }
  | { type: "row_count_min"; min: number }
  | { type: "custom"; sql: string; expected: boolean };

export type JobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Job {
  id: number;
  name: string;
  status: JobStatus;
  source_query: string;
  target_table?: string;
  started_at?: string;
  finished_at?: string;
  error_message?: string;
  pgmq_msg_id?: number;
}

export interface GovernanceViolation {
  rule: GovernanceRule;
  message: string;
  sample_rows?: unknown[];
}

export interface GovernanceReport {
  passed: boolean;
  violations: GovernanceViolation[];
  error?: {
    message: string;
    stack?: string;
  };
}

export interface OperationOptions {
  mode: SqlMode;
  queue?: boolean;
  name?: string;
}

export interface SyncOptions extends OperationOptions {
  source: TableRef;
  target: TableRef;
  where?: string;
}

export interface CleanseOptions extends OperationOptions {
  source: TableRef;
  target: TableRef;
  rules: CleanseRule[];
}

export interface GovernanceCheckOptions extends OperationOptions {
  target: TableRef;
  rules: GovernanceRule[];
}

export type ToolkitCtx = Ctx & {
  db: NonNullable<Ctx["db"]>;
};
