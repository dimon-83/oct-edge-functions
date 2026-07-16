export type PgDuckdbErrorCode =
  | "EXTENSION_MISSING"
  | "PGMQ_MISSING"
  | "RPC_FAILED"
  | "DIRECT_CONNECTION_FAILED"
  | "JOB_NOT_FOUND"
  | "INVALID_RULE"
  | "OPERATION_FAILED";

export class PgDuckdbError extends Error {
  constructor(
    message: string,
    public readonly code: PgDuckdbErrorCode,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PgDuckdbError";
  }
}
