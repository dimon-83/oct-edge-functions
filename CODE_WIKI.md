# Oct Edge Functions Code Wiki

## 项目概述

Oct Edge Functions 是一个基于 Deno 2.x 的轻量级边缘函数运行时，专为"胖数据库"（Fat Database）架构设计。核心特点：

- **胖数据库架构**：以 PostgreSQL 为中心，通过 PostgREST 直接暴露数据库能力
- **边缘层轻量编排**：仅处理认证、校验、聚合，避免重型中间件
- **MCP 协议支持**：让 AI Coding Agent 自动编写、测试、部署函数
- **可插拔插件系统**：支持自定义认证、CORS、日志等中间件

### 技术栈

| 技术 | 用途 |
|------|------|
| Deno 2.x | 运行时环境 |
| TypeScript | 开发语言 |
| @supabase/postgrest-js | PostgREST 客户端 |
| @std/fs, @std/path | 标准库文件操作 |
| MCP (Model Context Protocol) | AI Agent 集成协议 |

---

## 系统架构

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      oct-edge-functions                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   HTTP API   │  │  MCP Server  │  │  Function    │          │
│  │   (prod)     │  │  (dev only)  │  │  Registry    │          │
│  │              │  │              │  │              │          │
│  │  /users      │  │  /mcp/sse    │  │  functions  │          │
│  │  /inlet-org  │  │  /mcp/message │  │    .json    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                 │                   │                  │
│         └─────────────────┴───────────────────┘                  │
│                           │                                      │
│                    ┌──────────────┐                            │
│                    │  Middleware   │                            │
│                    │   Pipeline    │                            │
│                    └──────────────┘                            │
│                           │                                      │
│                    ┌──────────────┐                            │
│                    │  functions/  │                            │
│                    │  (handlers)  │                            │
│                    └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### 请求处理流程

```
Request → Middleware Pipeline (logging → cors → auth) → Function Handler → Response
              ↓
         errorMiddleware (统一错误处理)
```

---

## 核心模块

### 1. 入口模块 (main.ts)

**文件**: `main.ts`

```typescript
import { corsMiddlewares, HttpServer, loggingMiddlewares } from "./lib/mod.ts";
import { authMiddlewares } from "./plugins/auth/index.ts";

const server = new HttpServer({
  port: PORT,
  functionsDir: FUNCTIONS_DIR,
  plugins: [...loggingMiddlewares, ...corsMiddlewares, ...authMiddlewares],
  mcpEnabled: MCP_ENABLED,
});
```

**职责**:
- 加载环境变量
- 配置中间件管道
- 条件启用 MCP（仅开发模式）
- 启动 HTTP 服务器

---

### 2. HTTP 服务器 (lib/server.ts)

**文件**: `lib/server.ts`

**类**: `HttpServer`

| 方法 | 说明 |
|------|------|
| `loadRoutes()` | 扫描 functions 目录，加载活跃函数，构建路由表 |
| `start()` | 启动 Deno.serve，监听端口 |
| `stop()` | 停止服务器 |
| `getRoutes()` | 获取当前路由表（用于测试） |

**路由加载逻辑**:
```typescript
// 仅加载 status === "active" 的函数
const activeFunctions = new Set(
  registry.functions
    .filter((f) => f.status === "active")
    .map((f) => f.name),
);

// 路由路径 = functions/{name}/index.ts → /{name}
const routePath = entry.path
  .replace(/\/index\.(ts|js)$/, "")
  .replace(/\/$/, "");
```

---

### 3. 中间件系统 (lib/middleware.ts)

**文件**: `lib/middleware.ts`

**类型定义**:
```typescript
export type Middleware = (
  req: Request,
  ctx: Ctx,
  next: () => Promise<Response>,
) => Response | Promise<Response>;
```

**核心函数**:

| 函数 | 说明 |
|------|------|
| `compose(middlewares)` | 将多个中间件组合成单个处理管道 |
| `errorMiddleware` | 统一错误处理，将异常转换为 HTTP 响应 |

**compose 执行顺序**:
```
Request → middleware[0] → middleware[1] → ... → function handler
                    ↑                                            │
                    └────────────────── ctx, next() ─────────────┘
```

**errorMiddleware 错误映射**:
| 错误类型 | HTTP 状态码 |
|----------|-------------|
| `AuthError` | 401 |
| `ValidationError` | 400 |
| `AppError` | 500 |

---

### 4. 上下文类型 (lib/context.ts)

**文件**: `lib/context.ts`

```typescript
export interface Ctx {
  db?: PostgrestClient;      // PostgREST 客户端
  user?: { id: number; username: string };  // 认证用户信息
  requestId?: string;        // 请求追踪 ID
  log?: Logger;              // 日志实例
}
```

**错误类**:

| 类 | 用途 | HTTP 状态 |
|----|------|-----------|
| `AuthError` | 认证失败 | 401 |
| `ValidationError` | 参数校验失败 | 400 |
| `AppError` | 应用逻辑错误 | 500 |

---

### 5. MCP 服务 (lib/mcp/)

#### 5.1 MCP Server (lib/mcp/server.ts)

**类**: 无（模块函数式）

**导出函数**:

| 函数 | 说明 |
|------|------|
| `handleSseRequest()` | 建立 SSE 会话，返回 session_id |
| `handleMessageRequest()` | 处理 JSON-RPC tool 调用 |
| `handleStreamableHttpRequest()` | 支持 StreamableHTTP 传输协议 |

**SSE 端点返回格式**:
```
event: endpoint
data: {"uri": "/mcp/message?session_id=xxx"}
```

#### 5.2 Session 管理 (lib/mcp/session.ts)

**类**: `InMemorySessionStore`

| 方法 | 说明 |
|------|------|
| `create()` | 创建新会话，返回 session_id |
| `get(id)` | 获取会话，更新最后活动时间 |
| `delete(id)` | 删除会话 |
| `cleanupExpired()` | 清理超时会话（默认 30 分钟） |

**会话超期时间**: 30 分钟（可配置）

#### 5.3 Tool Registry (lib/mcp/registry.ts)

**类**: `ToolRegistry`

```typescript
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}
```

#### 5.4 MCP Tools (lib/mcp/tools.ts)

**类**: `McpTools`（支持依赖注入）

**构造函数依赖**:
```typescript
constructor(
  private readonly registry: RegistryStore,
  private readonly testRunner: TestRunner,
  private readonly linter: Linter,
  private readonly sqlExecutor: SqlExecutor,
  private readonly buildService: BuildService,
)
```

**工具列表**:

| 工具名 | 说明 |
|--------|------|
| `list_functions` | 列出所有函数 |
| `get_function` | 获取函数元数据和源码 |
| `create_function` | 从模板创建函数 |
| `write_tests` | 生成测试脚手架 |
| `run_tests` | 运行测试 |
| `update_function` | 更新函数源码（含 lint 检查） |
| `deploy_function` | 部署函数（测试 + 升级版本 + 状态变为 active） |
| `disable_function` | 禁用函数（状态变为 deprecated） |
| `delete_function` | 归档函数（软删除，状态变为 archived） |
| `publish_to_prod` | 发布到生产（运行所有测试 + 构建 Docker 镜像） |
| `pg_create_table` | 创建 PostgreSQL 表 |
| `pg_create_view` | 创建视图（普通或物化） |
| `pg_create_routine` | 创建存储过程/函数 |
| `pg_create_policy` | 创建 RLS 策略 |

---

### 6. 函数注册表 (functions.json)

**文件**: `functions.json`

**结构**:
```json
{
  "functions": [
    {
      "name": "users",
      "path": "functions/users",
      "status": "active",
      "version": "1.0.0",
      "created_at": "2024-01-15T08:00:00Z",
      "updated_at": "2024-01-15T08:00:00Z",
      "history": [
        {
          "version": "1.0.0",
          "status": "active",
          "changed_at": "2024-01-15T08:00:00Z",
          "reason": "初始创建"
        }
      ]
    }
  ]
}
```

**函数状态流转**:
```
draft → testing → active → deprecated → archived
```

| 状态 | 说明 | 是否暴露为 HTTP 端点 |
|------|------|---------------------|
| `draft` | 草稿 | 否 |
| `testing` | 测试中 | 否 |
| `active` | 活跃 | 是 |
| `deprecated` | 已废弃 | 否 |
| `archived` | 已归档 | 否 |

---

### 7. 数据库客户端 (lib/db.ts)

**文件**: `lib/db.ts`

**函数**: `createClient(pgrestJwt, schema?)`

```typescript
export function createClient(
  pgrestJwt: string,
  schema?: string,
): PostgrestClient {
  return new PostgrestClient(PGREST_URL, {
    headers: {
      apikey: pgrestJwt,
      Authorization: `Bearer ${pgrestJwt}`,
    },
    schema: schema ?? PGREST_SCHEMA,
  });
}
```

---

### 8. 测试脚手架 (lib/testing.ts)

**文件**: `lib/testing.ts`

**Mock 工厂**:

| 函数 | 说明 |
|------|------|
| `createMockLogger()` | 创建空操作的 Logger mock |
| `createMockDb(overrides?)` | 创建链式调用的 DB mock |
| `createMockCtx(partial?)` | 创建完整的 Ctx mock |

**HTTP 测试辅助**:

| 函数 | 说明 |
|------|------|
| `buildRequest(options)` | 构建模拟 Request |
| `runHandler(handler, options)` | 运行 handler 并返回 Response |

**断言辅助**:

| 函数 | 说明 |
|------|------|
| `assertJsonResponse(response, expected, status?)` | 断言 JSON 响应内容 |
| `assertStatus(response, expectedStatus)` | 断言 HTTP 状态码 |

---

### 9. 代码模板 (lib/templates/)

**文件**: `lib/templates/{crud,query,proxy,transform}.ts`

| 模板 | 用途 |
|------|------|
| `crud.ts` | 标准的 REST CRUD 模板，支持 GET/POST/PATCH/DELETE |
| `query.ts` | 只读查询模板 |
| `proxy.ts` | 代理转发模板 |
| `transform.ts` | 数据转换模板 |

**CRUD 模板使用方式**:
```typescript
// 替换 {{TABLE_NAME}} 为实际表名
const templateCode = templateCode.replace(/\{\{TABLE_NAME\}\}/g, tableName);
```

---

### 10. 插件系统 (plugins/, lib/plugins/)

#### 10.1 认证插件 (plugins/auth/index.ts)

**默认实现**: 使用 `PGREST_JWT` 环境变量

```typescript
export const authMiddlewares = createAuthMiddlewares(envTokenProvider);
```

**自定义认证**: 实现 `PgrestTokenProvider` 接口

```typescript
class VaultTokenProvider implements PgrestTokenProvider {
  getToken(): string | undefined {
    return fetchSecret("pgrest-jwt");
  }
}
```

#### 10.2 CORS 插件 (lib/plugins/cors.ts)

**配置项**: `CORS_ORIGIN` 环境变量（默认 `*`）

#### 10.3 日志插件 (lib/plugins/logging.ts)

**功能**:
- 生成 `requestId`
- 记录请求日志
- 提供 `ctx.log`

---

## 依赖关系

### 项目依赖

```json
{
  "imports": {
    "@std/fs": "jsr:@std/fs@^1.0.0",
    "@std/path": "jsr:@std/path@^1.0.0",
    "@std/assert": "jsr:@std/assert@^1.0.0",
    "@supabase/postgrest-js": "npm:@supabase/postgrest-js@^1.18.0",
    "@oct-edge-fns-core/": "./lib/",
    "pg": "npm:pg@^8"
  }
}
```

### 依赖图

```
main.ts
├── lib/mod.ts
│   ├── lib/server.ts
│   │   ├── lib/middleware.ts
│   │   │   └── lib/context.ts
│   │   ├── lib/mcp/server.ts
│   │   │   ├── lib/mcp/session.ts
│   │   │   ├── lib/mcp/registry.ts
│   │   │   └── lib/mcp/tools.ts
│   │   │       └── lib/mcp/adapters/*
│   │   └── lib/db.ts
│   ├── lib/plugins/cors.ts
│   ├── lib/plugins/logging.ts
│   └── lib/testing.ts
└── plugins/auth/index.ts
```

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DENO_ENV` | `development` | `development` 开启 MCP，`production` 关闭 |
| `PORT` | `8080` | 服务端口 |
| `FUNCTIONS_DIR` | `./functions` | 函数目录 |
| `PGREST_URL` | `http://localhost:3000` | PostgREST 地址 |
| `PGREST_SCHEMA` | `public` | 数据库 schema |
| `PGREST_JWT` | - | PostgREST JWT（开发环境） |
| `CORS_ORIGIN` | `*` | 跨域来源 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `LOG_DIR` | `./logs` | 日志目录 |

---

## 运行方式

### 开发环境

```bash
# 使用 Docker Compose
make up ENV=dev

# 或直接运行
deno task dev
```

**服务地址**:
- HTTP API: `http://localhost:18080`
- MCP SSE: `http://localhost:18080/mcp/sse`
- MCP Message: `http://localhost:18080/mcp/message?session_id=xxx`

### 生产环境

```bash
# 构建并导出镜像
make export ENV=prod

# 导入并启动
docker load -i oct-edge-functions-prod.tar
docker compose up -d
```

**注意**: 生产环境不开启 MCP 服务

### 本地测试

```bash
# 运行所有测试
make test

# 运行单个文件
deno test --allow-all lib/middleware_test.ts
```

### 代码检查

```bash
make lint   # Deno lint
make fmt    # Deno fmt
```

---

## 函数编写规范

### 最小函数示例

```typescript
// functions/hello/index.ts
import type { Ctx } from "../../lib/context.ts";

export default async function handler(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  return Response.json({ message: "Hello, World!" });
}
```

### 使用数据库

```typescript
import { AuthError } from "../../lib/context.ts";
import type { Ctx } from "../../lib/context.ts";

export default async function handler(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  if (!ctx.db) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  const { data, error } = await ctx.db.from("my_table").select("*");
  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json(data);
}
```

### 函数约定

| 约定 | 说明 |
|------|------|
| 入口文件 | `functions/{name}/index.ts` |
| 必须导出 | `export default async function handler(req: Request, ctx: Ctx)` |
| 错误类型 | `AuthError` (401)、`ValidationError` (400)、`AppError` (500) |
| 数据库访问 | `ctx.db`（PostgrestClient） |
| 日志 | `ctx.log?.info/debug/error(message, meta)` |

---

## MCP 工具使用示例

### 1. 创建函数

```bash
curl -X POST http://localhost:18080/mcp/message?session_id=xxx \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_function",
      "arguments": {
        "name": "orders",
        "template": "crud",
        "spec": { "table_name": "orders" }
      }
    }
  }'
```

### 2. 部署函数

```bash
curl -X POST http://localhost:18080/mcp/message?session_id=xxx \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "deploy_function",
      "arguments": {
        "name": "orders",
        "version_bump": "minor",
        "reason": "添加订单管理功能"
      }
    }
  }'
```

---

## ADR (架构决策记录)

| 文件 | 说明 |
|------|------|
| `docs/adr/0001-mcp-integration.md` | MCP 集成决策 |
| `docs/adr/0002-functions-registry.md` | 函数注册表设计 |

---

## 关键文件索引

| 文件 | 行号 | 说明 |
|------|------|------|
| `main.ts` | 1-22 | 入口点 |
| `lib/server.ts` | 27-113 | HttpServer 类，路由加载 |
| `lib/middleware.ts` | 10-35 | compose 函数，中间件组合 |
| `lib/context.ts` | 4-30 | Ctx 类型和错误类 |
| `lib/db.ts` | 6-16 | createClient 函数 |
| `lib/mcp/server.ts` | 443-476 | handleSseRequest |
| `lib/mcp/tools.ts` | 72-769 | McpTools 类 |
| `lib/testing.ts` | 145-153 | runHandler 测试辅助 |
| `functions.json` | 1-36 | 函数注册表 |
