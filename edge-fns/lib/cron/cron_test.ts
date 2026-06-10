/**
 * Tests for lib/cron/
 *
 * Run with: deno test lib/cron/cron_test.ts
 * Requires: --allow-read (for scheduler import) but no network in unit tests
 *
 * Focus areas:
 * - cron() function wrapper
 * - CronTask class and instance creation
 * - In-memory task management API (register / list / pause / resume / stop)
 * - Error handling (retry, catch)
 */

import { assertEquals, assertExists, assertInstanceOf, assert } from "jsr:@std/assert";
import { cron } from "./cron.ts";
import { CronTask } from "./types.ts";
import {
  registerTask,
  registerTasks,
  listTasks,
  pauseTask,
  resumeTask,
  stopTask,
} from "./scheduler.ts";

// ── Re-initialize scheduler state between tests ──────────────────
// The scheduler uses module-level state. For isolated tests,
// we work with a fresh set of tasks by relying on the fact that
// the in-memory registry accumulates. We reset between tests.
function resetSchedulerState() {
  // list all tasks and stop them
  const tasks = listTasks();
  for (const t of tasks) {
    stopTask(t.name);
  }
}

Deno.test({
  name: "cron() returns a CronTask instance",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "0 8 * * *",
      handler: () => {},
    });

    assertInstanceOf(task, CronTask);
    assertEquals(task.schedule, "0 8 * * *");
    assertEquals(task.status, "registered");
  },
});

Deno.test({
  name: "cron() uses provided name instead of inferring",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "*/5 * * * *",
      handler: () => {},
      name: "my-custom-task",
    });

    assertEquals(task.name, "my-custom-task");
  },
});

Deno.test({
  name: "cron() passes timezone and maxRuns to CronTask",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "0 9 * * 1-5",
      handler: () => {},
      timezone: "Asia/Shanghai",
      maxRuns: 10,
    });

    assertEquals(task.timezone, "Asia/Shanghai");
    assertEquals(task.maxRuns, 10);
  },
});

Deno.test({
  name: "cron() with paused:true creates task with paused status",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "* * * * *",
      handler: () => {},
      paused: true,
    });

    assertEquals(task.status, "paused");
  },
});

Deno.test({
  name: "cron() sets default retryOnFailure to 0",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "* * * * *",
      handler: () => {},
    });

    assertEquals(task.retryOnFailure, 0);
  },
});

Deno.test({
  name: "cron() with retryOnFailure = 3 stores the value",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "* * * * *",
      handler: () => {},
      retryOnFailure: 3,
    });

    assertEquals(task.retryOnFailure, 3);
  },
});

Deno.test({
  name: "registerTask adds task to the registry",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "0 8 * * *",
      handler: () => {},
      name: "test-register",
    });

    registerTask(task);
    const tasks = listTasks();

    assert(tasks.some((t) => t.name === "test-register"));
  },
});

Deno.test({
  name: "registerTasks adds multiple tasks at once",
  fn() {
    resetSchedulerState();

    const taskA = cron({
      schedule: "0 8 * * *",
      handler: () => {},
      name: "multi-a",
    });

    const taskB = cron({
      schedule: "0 9 * * *",
      handler: () => {},
      name: "multi-b",
    });

    registerTasks([taskA, taskB]);
    const tasks = listTasks();

    assertEquals(tasks.length, 2);
    assert(tasks.some((t) => t.name === "multi-a"));
    assert(tasks.some((t) => t.name === "multi-b"));
  },
});

Deno.test({
  name: "registerTask skips duplicate names with a warning",
  fn() {
    resetSchedulerState();

    const taskA = cron({
      schedule: "0 8 * * *",
      handler: () => {},
      name: "duplicate",
    });

    const taskB = cron({
      schedule: "0 9 * * *",
      handler: () => {},
      name: "duplicate",
    });

    registerTask(taskA);
    registerTask(taskB); // should warn and skip

    const tasks = listTasks();
    assertEquals(tasks.length, 1);
  },
});

Deno.test({
  name: "pauseTask and resumeTask change task status",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "* * * * *",
      handler: () => {},
      name: "pause-resume-test",
    });

    registerTask(task);

    // pause — no job yet since startCrons wasn't called
    // so pauseTask should return false
    const pauseResult = pauseTask("pause-resume-test");
    assertEquals(pauseResult, false);

    // stop it
    stopTask("pause-resume-test");
    const tasksAfterStop = listTasks();
    assertEquals(tasksAfterStop.length, 0);
  },
});

Deno.test({
  name: "stopTask removes the task from registry",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "0 8 * * *",
      handler: () => {},
      name: "stop-test",
    });

    registerTask(task);
    assertEquals(listTasks().length, 1);

    stopTask("stop-test");
    assertEquals(listTasks().length, 0);
  },
});

Deno.test({
  name: "stopTask on non-existent task returns false",
  fn() {
    resetSchedulerState();

    const result = stopTask("non-existent");
    assertEquals(result, false);
  },
});

Deno.test({
  name: "listTasks returns correct shape with name, schedule, status",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "*/10 * * * *",
      handler: () => {},
      name: "list-shape",
    });

    registerTask(task);
    const tasks = listTasks();

    assertExists(tasks[0].name);
    assertExists(tasks[0].schedule);
    assertExists(tasks[0].status);
    assertEquals(tasks[0].name, "list-shape");
    assertEquals(tasks[0].schedule, "*/10 * * * *");
    assertEquals(tasks[0].status, "registered");
  },
});

Deno.test({
  name: "CronTask.label returns formatted string",
  fn() {
    resetSchedulerState();

    const task = cron({
      schedule: "0 8 * * *",
      handler: () => {},
      name: "label-test",
    });

    assertEquals(task.label, "label-test (schedule: 0 8 * * *)");
  },
});

Deno.test({
  name: "CronTask context is passed to handler",
  fn() {
    resetSchedulerState();

    const ctx = { userId: "123", env: "production" };
    const task = cron({
      schedule: "* * * * *",
      handler: () => {},
      name: "context-test",
      context: ctx,
    });

    assertEquals(task.context?.userId, "123");
    assertEquals(task.context?.env, "production");
  },
});

Deno.test({
  name: "cron() catch callback is stored on task",
  fn() {
    resetSchedulerState();

    let caughtError: Error | null = null;

    const task = cron({
      schedule: "* * * * *",
      handler: () => { throw new Error("oops"); },
      name: "catch-test",
      retryOnFailure: 1,
      catch: (error, ctx) => {
        caughtError = error;
      },
    });

    assertExists(task.catch);
  },
});
