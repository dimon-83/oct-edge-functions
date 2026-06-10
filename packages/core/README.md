# @oct/core

Cron task framework for edge functions — schedule, manage, and monitor recurring tasks.

## Quick Start

```ts
import { startCrons, cron } from "@oct/core";

// Define a task (crons/hello-world.ts)
export default cron({
  schedule: "* * * * *",
  name: "hello-world",
  handler: () => {
    console.log(`Hello World from cron!`);
  },
});

// Start all tasks (main.ts)
await startCrons();
```

## API

### `cron(options)` → `CronTask`

Create a cron task instance.

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `schedule` | `string` | Yes | - | CRON expression |
| `handler` | `() => void \| Promise<void>` | Yes | - | Task handler |
| `name` | `string` | No | Filename | Task name for logging |
| `timezone` | `string` | No | System | IANA timezone |
| `maxRuns` | `number` | No | Unlimited | Max executions |
| `paused` | `boolean` | No | `false` | Start paused |
| `context` | `object` | No | - | Context data |
| `retryOnFailure` | `number` | No | `0` | Retry count |
| `catch` | `(err, ctx) => void` | No | - | Error callback |

### Management API

```ts
import { startCrons, listTasks, pauseTask, resumeTask, stopTask } from "@oct/core";

await startCrons();
listTasks();          // [{ name, schedule, status }]
pauseTask("name");
resumeTask("name");
stopTask("name");
```

## License

MIT
