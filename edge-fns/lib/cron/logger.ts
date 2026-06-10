export interface CronLogger {
  start(taskLabel: string): void;
  complete(taskLabel: string, elapsedMs: number): void;
  failed(taskLabel: string, attempts: number, error: Error): void;
  retry(taskLabel: string, attempt: number, error: Error): void;
}

export interface LoggerOptions {
  /** Custom logger override */
  logger?: CronLogger;
}

export const defaultLogger: CronLogger = {
  start(taskLabel) {
    console.log(`[cron] ${taskLabel} started`);
  },
  complete(taskLabel, elapsedMs) {
    console.log(`[cron] ${taskLabel} completed (took ${elapsedMs}ms)`);
  },
  failed(taskLabel, attempts, error) {
    console.error(`[cron] ${taskLabel} failed after ${attempts} attempts: ${error.message}`);
  },
  retry(taskLabel, attempt, error) {
    console.warn(`[cron] ${taskLabel} attempt ${attempt} failed: ${error.message} — retrying`);
  },
};
