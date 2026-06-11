/**
 * Hello World cron task
 *
 * 每分鐘打印一次 Hello World，作為定時任務的入門範例。
 */

import { cron } from "@oct-edge-fns/core";

export default cron({
  schedule: "* * * * *",
  name: "hello-world",
  handler: () => {
    console.log(`[${new Date().toISOString()}] Hello World from cron!`);
  },
});
