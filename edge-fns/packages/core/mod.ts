/**
 * @oct/core — oct-edge-fns core library
 *
 * Provides the cron scheduling framework and other core utilities.
 *
 * ## Cron
 *
 * ```ts
 * import { cron, startCrons, listTasks } from "@oct/core";
 *
 * // Define a cron task
 * export default cron({
 *   schedule: "0 8 * * *",
 *   handler: async () => { ... },
 *   timezone: "Asia/Shanghai",
 * });
 *
 * // In main.ts — start all tasks
 * await startCrons();
 *
 * // At runtime — inspect and manage tasks
 * console.log(listTasks());
 * ```
 *
 * @module
 */

export {
  cron,
  CronTask,
  scanCrons,
  registerTask,
  registerTasks,
  startCrons,
  listTasks,
  pauseTask,
  resumeTask,
  stopTask,
} from "../../lib/cron/mod.ts";

export type {
  CronOptions,
  CronHandler,
  CronCatchHandler,
  CronStatus,
  SchedulerOptions,
  CronLogger,
} from "../../lib/cron/mod.ts";
