/**
 * oct-edge-fns cron library
 *
 * Built-in framework for scheduling cron tasks in user projects.
 * Powered by jsr:@hexagon/croner.
 *
 * ## Quick start
 *
 * ```ts
 * // main.ts
 * import { startCrons } from "@oct/core";
 * await startCrons();
 * ```
 *
 * ```ts
 * // crons/daily-report.ts
 * import { cron } from "@oct/core";
 *
 * export default cron({
 *   schedule: "0 8 * * *",
 *   handler: async () => {
 *     console.log("Generating daily report...");
 *   },
 *   timezone: "Asia/Shanghai",
 * });
 * ```
 */

export { cron } from "./cron.ts";
export { CronTask } from "./types.ts";
export type {
  CronCatchHandler,
  CronHandler,
  CronOptions,
  CronStatus,
} from "./types.ts";
export {
  listTasks,
  pauseTask,
  registerTask,
  registerTasks,
  resumeTask,
  scanCrons,
  startCrons,
  stopTask,
} from "./scheduler.ts";
export type { SchedulerOptions } from "./scheduler.ts";
export type { CronLogger } from "./logger.ts";
