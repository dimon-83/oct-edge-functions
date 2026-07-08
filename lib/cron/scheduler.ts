import { CronTask } from "./types.ts";
import { type CronLogger, defaultLogger } from "./logger.ts";

// In-memory task registry
let tasks: CronTask[] = [];
let started = false;

export interface SchedulerOptions {
  /** Custom logger override */
  logger?: CronLogger;
  /** Scan directory (default: "./crons") */
  scanDir?: string;
}

/**
 * Scan the `crons/` directory and register all CronTask instances.
 *
 * Convention:
 * - Scans `crons/*.ts` and `crons/*.js` only (flat, no recursion)
 * - Skips `*.test.*`, `*.spec.*`, `_*` prefixed files, and directories
 */
export async function scanCrons(scanDir = "./crons"): Promise<CronTask[]> {
  const discovered: CronTask[] = [];

  try {
    // Dynamic directory listing
    const entries: string[] = [];

    // Walk the directory using Deno's filesystem API
    for await (const entry of Deno.readDir(scanDir)) {
      if (!entry.isFile) continue;
      const name = entry.name;

      // Skip tests, specs, and underscore-prefixed files
      if (
        name.startsWith("_") ||
        name.endsWith(".test.ts") || name.endsWith(".test.js") ||
        name.endsWith(".spec.ts") || name.endsWith(".spec.js")
      ) continue;

      // Accept only .ts and .js files
      if (!name.endsWith(".ts") && !name.endsWith(".js")) continue;

      entries.push(name);
    }

    for (const fileName of entries) {
      // Use absolute file path so dynamic import resolves against the filesystem
      // even when this module is loaded from a remote URL (e.g. JSR).
      const filePath =
        new URL(`${scanDir}/${fileName}`, `file://${Deno.cwd()}/`).href;
      try {
        const mod = await import(filePath);
        const exported = mod.default;

        if (exported instanceof CronTask) {
          discovered.push(exported);
        }
      } catch (err) {
        console.error(`[cron] Failed to load ${filePath}:`, err);
      }
    }
  } catch (_err) {
    // crons/ directory doesn't exist — nothing to scan
  }

  return discovered;
}

/**
 * Register a CronTask with the scheduler.
 * Does NOT start it — call startCrons() to begin execution.
 */
export function registerTask(task: CronTask): void {
  if (tasks.some((t) => t.name === task.name)) {
    console.warn(
      `[cron] Task "${task.name}" already registered — skipping duplicate`,
    );
    return;
  }
  tasks.push(task);
}

/**
 * Register multiple tasks at once.
 */
export function registerTasks(discovered: CronTask[]): void {
  for (const task of discovered) {
    registerTask(task);
  }
}

/**
 * Start all registered cron tasks.
 * Must be called explicitly by the user (e.g. in main.ts).
 */
export async function startCrons(opts?: SchedulerOptions): Promise<void> {
  if (started) {
    console.warn("[cron] startCrons() called twice — ignoring");
    return;
  }

  const log = opts?.logger ?? defaultLogger;

  // Auto-scan if no tasks registered yet
  if (tasks.length === 0) {
    const discovered = await scanCrons(opts?.scanDir);
    registerTasks(discovered);
  }

  // Dynamically import croner
  const { Cron } = await import("@hexagon/croner");

  for (const task of tasks) {
    // For paused tasks, create the cron job in paused state so
    // resumeTask() can unpause it later
    const isPaused = task.status === "paused";

    const job = new Cron(
      task.schedule,
      { timezone: task.timezone, maxRuns: task.maxRuns, paused: isPaused },
      async () => {
        const startTime = performance.now();
        log.start(task.label);

        let attempt = 0;
        const maxAttempts = 1 + (task.retryOnFailure ?? 0);

        while (attempt < maxAttempts) {
          attempt++;
          try {
            await task.handler(task.context);
            const elapsed = Math.round(performance.now() - startTime);
            log.complete(task.label, elapsed);
            return; // success — exit retry loop
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxAttempts) {
              log.retry(task.label, attempt, error);
            } else {
              log.failed(task.label, maxAttempts, error);
              task.catch?.(error, {
                name: task.name,
                schedule: task.schedule,
                attempt,
              });
            }
          }
        }
      },
    );

    task.job = job;
    if (!isPaused) task.status = "running";
  }

  started = true;
}

// ── Task management API ──────────────────────────────────────────

/**
 * List all registered cron tasks and their statuses.
 */
export function listTasks(): Array<
  { name: string; schedule: string; status: string }
> {
  return tasks.map((t) => ({
    name: t.name,
    schedule: t.schedule,
    status: t.status,
  }));
}

/**
 * Pause a running cron task by name.
 */
export function pauseTask(name: string): boolean {
  const task = tasks.find((t) => t.name === name);
  if (!task || !task.job) return false;

  const cronJob = task.job as { pause: () => void };
  cronJob.pause();
  task.status = "paused";
  return true;
}

/**
 * Resume a paused cron task by name.
 */
export function resumeTask(name: string): boolean {
  const task = tasks.find((t) => t.name === name);
  if (!task || !task.job) return false;

  const cronJob = task.job as { resume: () => void };
  cronJob.resume();
  task.status = "running";
  return true;
}

/**
 * Stop and unregister a cron task by name.
 * Works even if the task hasn't been started (no underlying croner job).
 */
export function stopTask(name: string): boolean {
  const task = tasks.find((t) => t.name === name);
  if (!task) return false;

  if (task.job) {
    const cronJob = task.job as { stop: () => void };
    cronJob.stop();
  }
  task.status = "stopped";
  tasks = tasks.filter((t) => t.name !== name);
  return true;
}
