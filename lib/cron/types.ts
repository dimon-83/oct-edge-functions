/** Options for defining a cron task */
export interface CronOptions {
  /** CRON expression, e.g. "0 8 * * *" */
  schedule: string;

  /** Task handler function */
  handler: CronHandler;

  /** Task name for logging and monitoring. Defaults to inferred filename. */
  name?: string;

  /** IANA timezone, e.g. "Asia/Shanghai" */
  timezone?: string;

  /** Max executions (for one-shot tasks). Default: unlimited. */
  maxRuns?: number;

  /** Start paused. Default: false. */
  paused?: boolean;

  /** Context data passed to handler */
  context?: Record<string, unknown>;

  /** Max retry attempts on failure. 0 = no retry. Default: 0. */
  retryOnFailure?: number;

  /** Error callback invoked after all retries exhausted */
  catch?: CronCatchHandler;
}

export type CronHandler = (
  ctx?: Record<string, unknown>,
) => void | Promise<void>;

export type CronCatchHandler = (
  error: Error,
  context: { name: string; schedule: string; attempt: number },
) => void | Promise<void>;

export type CronStatus = "registered" | "running" | "paused" | "stopped";

/**
 * A cron task instance returned by cron().
 * Identifiable via instanceof check for the scheduler scanner.
 */
export class CronTask {
  readonly schedule: string;
  readonly handler: CronHandler;
  readonly name: string;
  readonly timezone?: string;
  readonly maxRuns?: number;
  readonly retryOnFailure: number;
  readonly catch?: CronCatchHandler;
  readonly context?: Record<string, unknown>;
  status: CronStatus;

  /** Underlying croner job — set by scheduler after registration */
  job: unknown | null = null;

  constructor(opts: CronOptions & { name: string }) {
    this.schedule = opts.schedule;
    this.handler = opts.handler;
    this.name = opts.name;
    this.timezone = opts.timezone;
    this.maxRuns = opts.maxRuns;
    this.retryOnFailure = opts.retryOnFailure ?? 0;
    this.catch = opts.catch;
    this.context = opts.context;
    this.status = opts.paused ? "paused" : "registered";
  }

  /** Human-readable identifier for logs */
  get label(): string {
    return `${this.name} (schedule: ${this.schedule})`;
  }
}
