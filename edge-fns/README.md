# oct-edge-fns

Edge Functions 平台——提供内置 cron 定时任务框架、函数运行时、以及脚手架工具，帮助开发者快速构建边缘计算应用。

## 仓库结构

```
oct-edge-fns/
├── lib/                               # 内置工具库
│   └── cron/                          # cron 定时任务框架
│       ├── cron.ts                    # cron() 函数包装器
│       ├── scheduler.ts               # 扫描、注册、启动、任务管理 API
│       ├── types.ts                   # CronTask class、CronOptions 类型
│       ├── logger.ts                  # 内置日志格式
│       ├── mod.ts                     # barrel 导出
│       ├── cron_test.ts               # 单元测试（Deno）
│       └── cron_test.node.ts          # 单元测试（Node.js）
├── packages/
│   └── core/                          # @oct/core JSR 包入口
│       └── mod.ts                     # 从 lib/cron re-export
├── scripts/
│   └── create-oct-edge-fns/           # 脚手架命令
│       └── template/                  # 新项目模板
│           ├── main.ts                #   应用入口
│           ├── import_map.json        #   import map
│           └── crons/                 #   业务 cron 目录
│               └── hello-world.ts     #   Hello World 示例
├── docs/
│   └── adr/
│       └── 0001-function-wrapper-vs-decorator.md
├── CONTEXT.md                         # 领域术语表
└── README.md                          # ← 你在这里
```

## 快速开始

### 创建新项目

```sh
npx create-oct-edge-fns my-app
cd my-app
```

### 启动 cron 任务

```ts
// main.ts
import { startCrons } from "@oct/core";

await startCrons();
console.log("[app] All cron tasks started. Press Ctrl+C to exit.");
```

### 编写第一个定时任务

```ts
// crons/hello-world.ts
import { cron } from "@oct/core";

export default cron({
  schedule: "* * * * *",
  name: "hello-world",
  handler: () => {
    console.log(`[${new Date().toISOString()}] Hello World from cron!`);
  },
});
```

## Cron 框架

基于 `jsr:@hexagon/croner` 构建，不重复造轮子。

### 定义任务

函数包裹器风格——不是装饰器，但读起来一样声明式：

```ts
import { cron } from "@oct/core";

export default cron({
  schedule: "0 8 * * *",
  handler: async () => {
    // 业务逻辑
  },
  timezone: "Asia/Shanghai",
  retryOnFailure: 3,
  catch: (err, ctx) => {
    console.error(`[${ctx.name}] ${err.message}`);
  },
});
```

### 完整选项

| 选项 | 类型 | 必需 | 默认 | 说明 |
|------|------|------|------|------|
| `schedule` | `string` | ✅ | - | CRON 表达式 |
| `handler` | `() => void \| Promise<void>` | ✅ | - | 处理函数 |
| `name` | `string` | ❌ | 文件名（自动推断） | 任务名，用于日志和监控 |
| `timezone` | `string` | ❌ | 系统时区 | IANA 时区，如 `"Asia/Shanghai"` |
| `maxRuns` | `number` | ❌ | 无限制 | 最大执行次数 |
| `paused` | `boolean` | ❌ | `false` | 初始化时暂停 |
| `context` | `object` | ❌ | - | 传递给 handler 的上下文数据 |
| `retryOnFailure` | `number` | ❌ | `0`（不重试） | 失败重试次数 |
| `catch` | `(err, ctx) => void` | ❌ | - | 所有重试用尽后的错误回调 |

### 文件约定

```
crons/
├── daily-report.ts       ← 被扫描注册
├── hourly-cleanup.ts     ← 被扫描注册
├── _helpers.ts           ← 跳过（_ 前缀）
└── utils/                ← 跳过（子目录）
```

- 只扫描 `crons/*.ts` 和 `crons/*.js`（一级文件，不递归）
- 跳过 `*.test.*`、`*.spec.*`、`_` 前缀文件、子目录

### 任务管理 API

```ts
import {
  startCrons,     // 启动所有 cron 任务
  listTasks,      // 列出所有任务及其状态
  pauseTask,      // 暂停指定任务
  resumeTask,     // 恢复指定任务
  stopTask,       // 停止并注销指定任务
} from "@oct/core";

await startCrons();
console.log(listTasks());   // [{ name, schedule, status }]

pauseTask("daily-report");
resumeTask("daily-report");
stopTask("hourly-cleanup");
```

### 日志输出

内置日志格式，开箱即用：

```
[cron] daily-report (schedule: 0 8 * * *) started
[cron] daily-report (schedule: 0 8 * * *) completed (took 234ms)
[cron] daily-report (schedule: 0 8 * * *) attempt 1 failed: Connection timeout — retrying
[cron] daily-report (schedule: 0 8 * * *) failed after 3 attempts: Connection timeout
```

支持自定义 logger：

```ts
import { startCrons } from "@oct/core";

await startCrons({
  logger: {
    start(label) { /* ... */ },
    complete(label, ms) { /* ... */ },
    failed(label, attempts, err) { /* ... */ },
    retry(label, attempt, err) { /* ... */ },
  },
});
```

## 运行环境

- **Deno** ≥ 2.x（首选，原生支持 JSR）
- **Node.js** ≥ 22（通过 `tsx` 运行 TypeScript）

## 测试

```sh
# Deno
deno test lib/cron/cron_test.ts

# Node.js
npx tsx lib/cron/cron_test.node.ts
```

## 发布到 JSR

`packages/core/mod.ts` 是 `@oct/core` 包的入口，re-export 了 `lib/cron/` 的所有公共 API。

```sh
cd packages/core
npx jsr publish
```

## 架构决策记录

参见 [docs/adr/](./docs/adr/)：

| ID | 标题 | 状态 |
|----|------|------|
| 0001 | 函数包裹器 vs 装饰器 | Accepted |
