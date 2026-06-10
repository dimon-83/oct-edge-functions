# oct-edge-fns 领域术语表

## 核心概念

| 术语 | 定义 | 别名 |
|------|------|------|
| **System cron library** | 平台仓库 `lib/cron/` 提供的定时任务框架，用户通过 `@oct/core` 导入 | 内置cron库 |
| **User cron job** | 用户项目中 `crons/` 目录下定义的业务定时任务 | 业务cron任务 |
| **Cron task (instance)** | `cron()` 函数返回的 `CronTask` 实例，包含调度表达式和处理函数 | 任务实例 |
| **Scheduler** | 负责扫描 `crons/` 目录、注册 `CronTask` 实例到 `croner` 运行时、管理生命周期的组件 | 调度器 |

## 文件结构约定

| 路径 | 归属 | 内容 |
|------|------|------|
| `oct-edge-fns/lib/cron/` | 平台仓库 | 内置 cron 框架源码 |
| `oct-edge-fns/packages/core/` | 平台仓库 | 从 lib/cron re-export，发到 JSR `@oct/core` |
| `my-app/crons/` | 用户项目 | 业务 cron 任务（扁平结构，每个文件一个任务） |
| `my-app/functions/` | 用户项目 | 业务函数，可在 cron 中通过 import 直接调用 |

## Cron 任务注册

- 使用 **函数包裹器** 风格：`export default cron({...})`
- 导出值为 `CronTask` 实例，`instanceof CronTask` 可鉴别
- 扫描器自动发现 `crons/*.ts`（一级，跳过 `*.test.ts` / `_` 前缀 / 子目录）

## CronOptions 字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `schedule` | `string` | 是 | CRON 表达式 |
| `handler` | `() => void \| Promise<void>` | 是 | 处理函数 |
| `name` | `string` | 否 | 任务名（日志/监控用），默认从文件名推断 |
| `timezone` | `string` | 否 | IANA 时区，如 `"Asia/Shanghai"` |
| `maxRuns` | `number` | 否 | 最大执行次数 |
| `paused` | `boolean` | 否 | 初始化时是否暂停 |
| `context` | `Record<string, unknown>` | 否 | 上下文数据 |
| `retryOnFailure` | `number` | 否 | 失败重试次数（0=不重试） |
| `catch` | `(error, context) => void` | 否 | 错误回调 |

## 日志格式

| 事件 | 格式 |
|------|------|
| 任务开始 | `[cron] <name> started (schedule: <expr>)` |
| 任务完成 | `[cron] <name> completed (took <ms>ms)` |
| 任务失败 | `[cron] <name> failed after <N> attempts: <message>` |

## 运行时

- 调度引擎：`jsr:@hexagon/croner`
- 不重新造轮子
- 启动方式：用户显式调用 `await startCrons()` 触发扫描 + 注册
