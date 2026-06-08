# Oct Edge Functions

Deno 驱动的边缘函数运行时，支持 AI Coding Agent 通过 MCP 协议自动编写、测试、部署函数。

---

## 快速开始

### 环境要求

- Docker + Docker Compose
- Make（可选，用于快捷命令）
- Deno 2.x（本地开发，可选）

### 启动开发环境

```bash
# 使用 Make
make up ENV=dev

# 或使用 docker compose 直接启动
docker compose up -d
```

服务启动后：
- HTTP API: `http://localhost:{{PORT_DEV}}`
- MCP SSE: `http://localhost:{{PORT_DEV}}/mcp/sse`

### 启动生产环境

```bash
make up ENV=prod
```

生产环境 **不开启 MCP 服务**，仅暴露 HTTP API（端口 {{PORT_PROD}}）。

---

## 项目结构

```
.
├── functions/              # 边缘函数目录
│   └── helloworld/         # 示例：Hello World
│       ├── index.ts        # 函数入口（必须 export default handler）
│       └── test.ts         # 测试文件（Deno.test）
├── functions.json          # 函数注册表（状态、版本、changelog）
├── main.ts                 # 入口（路由加载 + MCP 条件挂载）
├── deno.json               # Deno 配置
├── Dockerfile              # 镜像构建
├── docker-compose.yml      # 容器编排
└── Makefile                # 快捷命令
```

---

## 手动编写 Function

### 最小示例

```typescript
// functions/helloworld/index.ts
import type { Ctx } from "@oct-edge-fns/core";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  ctx.log?.info("GET /helloworld");
  return Response.json({ message: "Hello, World!" });
}
```

### 使用数据库

```typescript
import { AuthError } from "@oct-edge-fns/core";
import type { Ctx } from "@oct-edge-fns/core";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
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

- 入口文件：`functions/{name}/index.ts`
- 必须导出：`export default async function handler(req: Request, ctx: Ctx)`
- 错误类型：`AuthError` (401)、`ValidationError` (400)、`AppError` (500)
- 数据库访问：`ctx.db`（PostgrestClient）
- 日志：`ctx.log?.info/debug/error(message, meta)`

---

## 手动测试

### 运行所有测试

```bash
make test
# 或
deno test --allow-all
```

### 运行单个函数测试

```bash
deno test --allow-all functions/helloworld/test.ts
```

### 代码检查

```bash
make lint
# 或
deno lint
```

---

## MCP Agent 集成

### 连接配置

#### Claude Code

创建或编辑 `~/.claude/mcp.json`：

```json
{
  "mcpServers": {
    "oct-edge-functions": {
      "type": "sse",
      "url": "http://localhost:{{PORT_DEV}}/mcp/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

启动 Claude Code 后，通过 `/mcp` 命令查看已连接的工具。

#### Cursor

在 Cursor Settings → MCP 中添加：

```json
{
  "oct-edge-functions": {
    "type": "sse",
    "url": "http://localhost:{{PORT_DEV}}/mcp/sse",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  }
}
```

#### Cline / Roo Code (VS Code)

在 Settings → MCP Servers 中添加：

```json
{
  "mcpServers": {
    "oct-edge-functions": {
      "type": "sse",
      "url": "http://localhost:{{PORT_DEV}}/mcp/sse",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

#### 通用 HTTP 测试

```bash
# 1. 建立 SSE 会话
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:{{PORT_DEV}}/mcp/sse

# 返回：
# event: endpoint
# data: {"uri":"/mcp/message?session_id=xxx"}

# 2. 调用 tool
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:{{PORT_DEV}}/mcp/message?session_id=xxx" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_functions",
      "arguments": {}
    }
  }'
```

> 鉴权复用现有 `Bearer` Token，与 HTTP API 一致。

### Agent 工作流

#### 1. 创建函数（自然语言）

```
Agent: 调用 create_function
  name: "orders"
  template: "crud"
  description: "订单管理，支持增删改查"
  spec: { table_name: "orders" }
```

#### 2. 生成测试

```
Agent: 调用 write_tests
  name: "orders"
→ 生成 functions/orders/test.ts
→ 状态变为 testing
```

#### 3. 运行测试

```
Agent: 调用 run_tests
  name: "orders"
→ 返回测试报告
```

#### 4. 自动修复（如失败）

```
Agent: 调用 update_function
  name: "orders"
  code: "...修复后的代码..."
→ 自动 lint 检查
→ 再次 run_tests
→ 最多重试 3 次
```

#### 5. 部署

```
Agent: 调用 deploy_function
  name: "orders"
  version_bump: "minor"
  reason: "添加订单管理功能"
→ 测试通过 → 版本升级 → 状态变为 active
→ 服务自动加载新 endpoint
```

#### 6. 发布生产

```
Agent: 调用 publish_to_prod
→ 全量测试通过
→ make export ENV=prod
→ 返回 tar 文件路径
```

---

## 端到端示例：从需求到发布

### 场景：添加「订单管理」功能

以下展示 Agent 与 MCP 的完整交互对话流：

#### Step 1: 查看现有函数

**Agent**: `list_functions`

**MCP 返回**:
```json
{
  "functions": [
    { "name": "helloworld", "status": "active", "version": "1.0.0" }
  ]
}
```

#### Step 2: 创建订单函数

**Agent**: `create_function`
```json
{
  "name": "orders",
  "template": "crud",
  "description": "订单管理，支持创建、查询、更新、删除订单",
  "spec": { "table_name": "orders" }
}
```

**MCP 返回**:
```json
{
  "success": true,
  "data": {
    "meta": {
      "name": "orders",
      "status": "draft",
      "version": "0.0.0"
    },
    "code": "import { AuthError..."
  }
}
```

> 生成 `functions/orders/index.ts`，基于 crud 模板，表名替换为 `orders`

#### Step 3: 生成测试

**Agent**: `write_tests`
```json
{ "name": "orders" }
```

**MCP 返回**:
```json
{
  "success": true,
  "data": {
    "test_path": "functions/orders/test.ts",
    "test_code": "import { runHandler, assertStatus }..."
  }
}
```

> 状态变为 `testing`

#### Step 4: 运行测试（首次）

**Agent**: `run_tests`
```json
{ "name": "orders" }
```

**MCP 返回**:
```json
{
  "success": false,
  "data": {
    "exit_code": 1,
    "passed": 2,
    "failed": 2,
    "output": "...AssertionError: expected 201 but got 400..."
  }
}
```

> POST 和 PATCH 测试失败，因为 mock db 返回了错误

#### Step 5: 自动修复（第1次）

**Agent**: `update_function`
```json
{
  "name": "orders",
  "code": "import { AuthError, ValidationError } from \"../../lib/context.ts\";\nimport type { Ctx } from \"../../lib/context.ts\";\n\nconst TABLE_NAME = \"orders\";\n\nexport default async function handler(req: Request, ctx: Ctx): Promise<Response> {\n  const url = new URL(req.url);\n  if (!ctx.db) { throw new AuthError(\"Missing or invalid Authorization header\"); }\n  try {\n    switch (req.method) {\n      case \"GET\": {\n        const id = url.searchParams.get(\"id\");\n        ctx.log?.info(`GET /${TABLE_NAME}`, { id });\n        if (id) {\n          const { data, error } = await ctx.db.from(TABLE_NAME).select(\"*\").eq(\"id\", id).single();\n          if (error) return Response.json({ error: error.message }, { status: 400 });\n          return Response.json(data);\n        }\n        const { data, error } = await ctx.db.from(TABLE_NAME).select(\"*\");\n        if (error) return Response.json({ error: error.message }, { status: 400 });\n        return Response.json(data);\n      }\n      case \"POST\": {\n        const body = await req.json();\n        const { data, error } = await ctx.db.from(TABLE_NAME).insert(body).select();\n        if (error) return Response.json({ error: error.message }, { status: 400 });\n        return Response.json(data, { status: 201 });\n      }\n      case \"PATCH\": {\n        const id = url.searchParams.get(\"id\");\n        if (!id) return Response.json({ error: \"id is required\" }, { status: 400 });\n        const body = await req.json();\n        const { data, error } = await ctx.db.from(TABLE_NAME).update(body).eq(\"id\", id).select();\n        if (error) return Response.json({ error: error.message }, { status: 400 });\n        return Response.json(data);\n      }\n      case \"DELETE\": {\n        const id = url.searchParams.get(\"id\");\n        if (!id) return Response.json({ error: \"id is required\" }, { status: 400 });\n        const { data, error } = await ctx.db.from(TABLE_NAME).delete().eq(\"id\", id).select();\n        if (error) return Response.json({ error: error.message }, { status: 400 });\n        return Response.json(data);\n      }\n      default:\n        return Response.json({ error: \"Method not allowed\" }, { status: 405 });\n    }\n  } catch (err) {\n    if (err instanceof AuthError || err instanceof ValidationError) throw err;\n    return Response.json({ error: String(err) }, { status: 500 });\n  }\n}"
}
```

> 代码通过 lint 检查

#### Step 6: 再次运行测试

**Agent**: `run_tests`
```json
{ "name": "orders" }
```

**MCP 返回**:
```json
{
  "success": true,
  "data": {
    "exit_code": 0,
    "passed": 4,
    "failed": 0,
    "output": "running 4 tests...\ntest orders - should handle GET ... ok\ntest orders - should handle POST ... ok\ntest orders - should handle PATCH ... ok\ntest orders - should handle DELETE ... ok\n\ntest result: ok. 4 passed"
  }
}
```

#### Step 7: 部署

**Agent**: `deploy_function`
```json
{
  "name": "orders",
  "version_bump": "minor",
  "reason": "添加订单管理 CRUD 功能"
}
```

**MCP 返回**:
```json
{
  "success": true,
  "data": {
    "meta": {
      "name": "orders",
      "status": "active",
      "version": "0.1.0",
      "history": [
        { "version": "0.1.0", "status": "active", "changed_at": "2024-06-01T10:30:00Z", "reason": "添加订单管理 CRUD 功能" }
      ]
    },
    "test_result": { "passed": 4, "failed": 0 }
  }
}
```

> 状态变为 `active`，服务自动加载 `/orders` endpoint

#### Step 8: 验证 HTTP API

```bash
curl http://localhost:{{PORT_DEV}}/helloworld

# 返回订单列表
```

#### Step 9: 发布生产

**Agent**: `publish_to_prod`

**MCP 返回**:
```json
{
  "success": true,
  "data": {
    "active_functions": ["helloworld", "orders"],
    "test_result": { "passed": 9, "failed": 0 },
    "build_output": "✅ 镜像导出完成: oct-edge-functions-prod.tar"
  }
}
```

> 全量测试通过，生成 `oct-edge-functions-prod.tar`

---

### Function 生命周期

```
draft → testing → active → deprecated → archived
   ↑_________|
```

| 状态 | 说明 | HTTP 挂载 |
|------|------|-----------|
| `draft` | 刚创建，测试未写 | ❌ |
| `testing` | 测试已写，验证中 | ❌ |
| `active` | 测试通过，已部署 | ✅ |
| `deprecated` | 已停用，保留回滚 | ❌ |
| `archived` | 已归档，待清理 | ❌ |

---

## 代码模板

| 模板 | 用途 | 占位符 |
|------|------|--------|
| `crud` | 单表 REST CRUD | `{{TABLE_NAME}}` |
| `query` | 只读查询 | `{{TABLE_NAME}}` |
| `proxy` | HTTP 代理转发 | `{{UPSTREAM_URL}}` |
| `transform` | 纯数据转换 | 无 |

---

## Makefile 命令

| 命令 | 说明 |
|------|------|
| `make build` | 构建 Docker 镜像 |
| `make up` | 启动服务 |
| `make down` | 停止服务 |
| `make export` | 导出镜像为 tar |
| `make logs` | 查看日志 |
| `make test` | 运行测试 |
| `make lint` | 代码检查 |
| `make clean` | 清理容器和镜像 |
| `make status` | 查看状态 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DENO_ENV` | `development` | `development` 开启 MCP，`production` 关闭 |
| `PORT` | `{{PORT_DEV}}` | 服务端口 |
| `FUNCTIONS_DIR` | `./functions` | 函数目录 |
| `PGREST_URL` | `http://localhost:3000` | PostgREST 地址 |
| `PGREST_SCHEMA` | `public` | 数据库 schema |
| `IA_CSC_BASE_URL` | - | Token 交换服务地址 |
| `CORS_ORIGIN` | `*` | 跨域来源 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `LOG_DIR` | `./logs` | 日志目录 |

---

## Docker 部署

### 构建并导出生产镜像

```bash
make export ENV=prod
# 生成 oct-edge-functions-prod.tar
```

### 无网环境导入

```bash
docker load -i oct-edge-functions-prod.tar
docker compose up -d
```

---

## HTTP API 文档

### 通用规范

- **Base URL**: `http://localhost:{{PORT_DEV}}`
- **鉴权**: `Authorization: Bearer YOUR_TOKEN`
- **Content-Type**: `application/json`

### 现有 Endpoints

#### GET /helloworld

Hello World 示例。

**响应示例**:
```json
{
  "message": "Hello, World!",
  "timestamp": "2024-01-15T08:00:00.000Z"
}
```

**状态码**:
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |

---

### 通用错误响应

```json
{
  "error": "错误描述信息"
}
```

| HTTP 状态码 | 场景 |
|-------------|------|
| 400 | 请求参数错误、数据库操作失败 |
| 401 | 缺少或无效 Authorization |
| 404 | 路由不存在 |
| 405 | HTTP 方法不允许 |
| 500 | 服务器内部错误 |

---

### MCP Endpoints（Dev Only）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/mcp/sse` | GET | 建立 SSE 会话，返回 session_id |
| `/mcp/message?session_id=xxx` | POST | 发送 JSON-RPC 请求调用 tool |

---

## 架构决策

详见 `docs/adr/`：

- [ADR-0001: MCP 集成](docs/adr/0001-mcp-integration.md)
- [ADR-0002: 函数注册表](docs/adr/0002-functions-registry.md)
