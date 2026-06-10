/**
 * Tests for lib/cron/ — Node.js compatible version
 *
 * Run with: npx tsx lib/cron/cron_test.node.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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

// Scheduler uses module-level state. Reset between tests.
function resetState() {
  const tasks = listTasks();
  for (const t of tasks) stopTask(t.name);
}

// ── cron() function ─────────────────────────────────────────────

describe("cron()", () => {
  it("returns a CronTask instance", () => {
    resetState();
    const task = cron({ schedule: "0 8 * * *", handler: () => {} });
    assert(task instanceof CronTask);
    assert.equal(task.schedule, "0 8 * * *");
    assert.equal(task.status, "registered");
  });

  it("uses provided name instead of inferring", () => {
    resetState();
    const task = cron({ schedule: "*/5 * * * *", handler: () => {}, name: "my-task" });
    assert.equal(task.name, "my-task");
  });

  it("passes timezone and maxRuns to CronTask", () => {
    resetState();
    const task = cron({
      schedule: "0 9 * * 1-5",
      handler: () => {},
      timezone: "Asia/Shanghai",
      maxRuns: 10,
    });
    assert.equal(task.timezone, "Asia/Shanghai");
    assert.equal(task.maxRuns, 10);
  });

  it("creates task with paused status", () => {
    resetState();
    const task = cron({ schedule: "* * * * *", handler: () => {}, paused: true });
    assert.equal(task.status, "paused");
  });

  it("sets default retryOnFailure to 0", () => {
    resetState();
    const task = cron({ schedule: "* * * * *", handler: () => {} });
    assert.equal(task.retryOnFailure, 0);
  });

  it("stores retryOnFailure value", () => {
    resetState();
    const task = cron({ schedule: "* * * * *", handler: () => {}, retryOnFailure: 3 });
    assert.equal(task.retryOnFailure, 3);
  });

  it("stores catch callback", () => {
    resetState();
    const task = cron({
      schedule: "* * * * *",
      handler: () => { throw new Error("oops"); },
      name: "catch-test",
      retryOnFailure: 1,
      catch: () => {},
    });
    assert.ok(task.catch);
  });
});

// ── CronTask class ──────────────────────────────────────────────

describe("CronTask", () => {
  it("label returns formatted string", () => {
    const task = cron({ schedule: "0 8 * * *", handler: () => {}, name: "label-test" });
    assert.equal(task.label, "label-test (schedule: 0 8 * * *)");
  });

  it("context is passed through", () => {
    const ctx = { userId: "123", env: "production" };
    const task = cron({ schedule: "* * * * *", handler: () => {}, name: "ctx-test", context: ctx });
    assert.equal(task.context?.userId, "123");
    assert.equal(task.context?.env, "production");
  });
});

// ── Task management API ─────────────────────────────────────────

describe("Task management API", () => {
  it("registerTask adds task to registry", () => {
    resetState();
    const task = cron({ schedule: "0 8 * * *", handler: () => {}, name: "reg-test" });
    registerTask(task);
    const tasks = listTasks();
    assert(tasks.some((t) => t.name === "reg-test"));
  });

  it("registerTasks adds multiple tasks at once", () => {
    resetState();
    const a = cron({ schedule: "0 8 * * *", handler: () => {}, name: "multi-a" });
    const b = cron({ schedule: "0 9 * * *", handler: () => {}, name: "multi-b" });
    registerTasks([a, b]);
    assert.equal(listTasks().length, 2);
  });

  it("registerTask skips duplicate names", () => {
    resetState();
    const a = cron({ schedule: "0 8 * * *", handler: () => {}, name: "dup" });
    const b = cron({ schedule: "0 9 * * *", handler: () => {}, name: "dup" });
    registerTask(a);
    registerTask(b);
    assert.equal(listTasks().length, 1);
  });

  it("listTasks returns correct shape", () => {
    resetState();
    const task = cron({ schedule: "*/10 * * * *", handler: () => {}, name: "shape" });
    registerTask(task);
    const t = listTasks()[0];
    assert.ok(t.name);
    assert.ok(t.schedule);
    assert.ok(t.status);
    assert.equal(t.name, "shape");
    assert.equal(t.schedule, "*/10 * * * *");
    assert.equal(t.status, "registered");
  });

  it("pauseTask on task without job returns false", () => {
    resetState();
    const task = cron({ schedule: "* * * * *", handler: () => {}, name: "pause-nojob" });
    registerTask(task);
    assert.equal(pauseTask("pause-nojob"), false);
  });

  it("stopTask removes task from registry", () => {
    resetState();
    const task = cron({ schedule: "0 8 * * *", handler: () => {}, name: "stop-test" });
    registerTask(task);
    assert.equal(listTasks().length, 1);
    stopTask("stop-test");
    assert.equal(listTasks().length, 0);
  });

  it("stopTask on non-existent task returns false", () => {
    resetState();
    assert.equal(stopTask("non-existent"), false);
  });
});
