import type { CronOptions } from "./types.ts";
import { CronTask } from "./types.ts";

/**
 * Create a cron task using function-wrapper style.
 *
 * Usage:
 * ```ts
 * export default cron({
 *   schedule: "0 8 * * *",
 *   handler: async () => { ... },
 *   timezone: "Asia/Shanghai",
 * });
 * ```
 *
 * The returned CronTask instance is detected by the scheduler
 * via `instanceof CronTask` after importing the file.
 */
export function cron(opts: CronOptions): CronTask {
  const name = opts.name ?? inferName();
  return new CronTask({ ...opts, name });
}

/** Infer task name from call site filename — falls back to "unnamed" */
function inferName(): string {
  // Attempt to determine name from import.meta or stack trace
  try {
    throw new Error("stack");
  } catch (e) {
    const stack = (e as Error).stack;
    if (stack) {
      // Look for the first frame outside this package
      const lines = stack.split("\n");
      for (const line of lines) {
        // Match pattern like "file:///path/to/crons/daily-report.ts:1:2"
        const match = line.match(/\/crons\/([^/.]+)\.(ts|js):/);
        if (match) return match[1];
      }
    }
  }
  return "unnamed";
}
