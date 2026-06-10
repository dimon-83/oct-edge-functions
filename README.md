# Oct Edge Functions

轻量级 Deno Edge Functions 运行时，为"胖数据库"架构而生。

![架构图](https://raw.githubusercontent.com/dimon-83/oct-edge-functions/master/docs/architecture.svg)

**核心理念**：以 PostgreSQL 为中心，通过 PostgREST 直接暴露数据库能力，
边缘层仅处理轻量编排（认证、校验、聚合），避免引入 Supabase、Inngest 等
重型中间件。提供 MCP 协议支持，让 AI Coding Agent 自动编写、测试、部署函数；
配合可插拔插件系统和样板项目，通过 `npx create-oct-edge-fns my-project` 
一键启动生产就绪的项目骨架。

---

## 快速开始

### 环境要求

- Docker + Docker Compose
- Make（可选，用于快捷命令）
- Deno 2.x（本地开发，可选）

### 创建新项目（脚手架）

```bash
npx create-oct-edge-fns my-project
cd my-project
deno task dev
```

脚手架从 `example/` 模板拷贝项目结构，自动替换项目名称。详见 [create-oct-edge-fns](#create-oct-edge-fns-npm)。

### 启动开发环境

```bash
# 使用 Make
make up ENV=dev

# 或使用 docker compose 直接启动
docker compose up -d
```

服务启动后：

- HTTP API: `http://localhost:18080`
- MCP SSE: `http://localhost:18080/mcp/sse`

### 启动生产环境

```bash
make up ENV=prod
```

生产环境 **不开启 MCP 服务**，仅暴露 HTTP API。

---

## 项目结构

```
.
├── functions/              # 边缘函数目录
│   ├── users/              # 示例：用户管理 CRUD
│   │   ├── index.ts        # 函数入口（必须 export default handler）
│   │   └── test.ts         # 测试文件（Deno.test）
│   └── inlet-org-tree/     # 示例：组织架构树查询
│       ├── index.ts
│       ├── inlet.ts        # 业务逻辑拆分
│       └── test.ts
├── lib/                    # 核心库
│   ├── context.ts          # Ctx 类型、错误类
│   ├── middleware.ts       # 中间件编排（compose）
│   ├── db.ts               # PostgREST 客户端
│   ├── logger.ts           # 日志（文件轮转）
│   ├── testing.ts          # 测试脚手架（mock ctx、HTTP 辅助）
│   ├── pg.ts               # PostgreSQL 工具（SQL 安全检查）
│   ├── templates/          # 代码模板（crud/query/proxy/transform）
│   ├── plugins/            # 内置插件
│   │   ├── cors.ts         # CORS 跨域
│   │   └── logging.ts      # 请求日志
│   └── mcp/                # MCP 服务实现
│       ├── server.ts       # SSE 服务器
│       ├── tools.ts        # MCP tools
│       └── session.ts      # 内存 session
├── scripts/                # 辅助脚本（core-link/unlink 等）
├── example/                # 模板项目（create-oct-edge-fns 脚手架来源）
├── plugins/                # 项目级插件
│   └── auth/               # 认证中间件（默认读 PGREST_JWT，用户可自定义）
├── packages/               # 可发布的包
│   └── create-oct-edge-fns/ # CLI 脚手架（发布到 npm）
├── functions.json          # 函数注册表（状态、版本、changelog）
├── main.ts                 # 入口（路由加载 + MCP 条件挂载）
├── deno.json               # Deno 配置
├── Dockerfile              # 镜像构建（多阶段构建 + healthcheck）
├── docker-compose.yml      # 容器编排
└── Makefile                # 快捷命令
```

---

## 手动编写 Function

### 最小示例

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

- 入口文件：`functions/{name}/index.ts`
- 必须导出：`export default async function handler(req: Request, ctx: Ctx)`
- 错误类型：`AuthError` (401)、`ValidationError` (400)、`AppError` (500)
- 数据库访问：`ctx.db`（PostgrestClient）
- 日志：`ctx.log?.info/debug/error(message, meta)`

---

## 认证架构

### 分层设计

```
lib/plugins/auth.ts          ← 抽象层：PgrestTokenProvider 接口 + createAuthMiddlewares 工厂
plugins/auth/index.ts        ← 项目级实现：用户在此文件自定义认证逻辑
main.ts                      ← 从 plugins/auth/index.ts 导入 authMiddlewares 挂载到流水线
```

### 默认实现（开发环境）

`plugins/auth/index.ts` 默认使用 `envTokenProvider`，从环境变量 `PGREST_JWT` 读取 PostgREST JWT：

```bash
# .env 配置示例
PGREST_JWT=your_pgrest_jwt_here
```

中间件将 token 通过 `createClient()` 注入 `ctx.db`，所有函数请求共享此数据库凭证。

> **⚠️ 警告：`PGREST_JWT` 仅用于开发环境。生产环境必须在 `plugins/auth/index.ts` 中替换为安全的认证实现。**

### 生产环境自定义

编辑 `plugins/auth/index.ts`，替换 token 提供者：

```typescript
import { createAuthMiddlewares } from "@oct-edge-fns/core";

// 示例：自定义 token 提供者（OAuth2 / 内部认证服务 / 其他）
const myProvider = {
  getToken: () => {
    // 从 vault、KMS 或其他安全源获取 token
    return Deno.env.get("PROD_PGREST_JWT");
  },
};

export const authMiddlewares = createAuthMiddlewares(myProvider);
```

也可直接实现完整的 `PgrestTokenProvider` 接口：

```typescript
import type { PgrestTokenProvider } from "@oct-edge-fns/core";

class VaultTokenProvider implements PgrestTokenProvider {
  getToken(): string | undefined {
    // 从 HashiCorp Vault / AWS Secrets Manager 获取
    return fetchSecret("pgrest-jwt");
  }
}
```

---

## 测试

### 运行所有测试

```bash
make test
# 或
deno test --allow-all
```

### 运行单个文件

```bash
make test FILE=lib/middleware_test.ts
# 或
deno test --allow-all lib/middleware_test.ts
```

### 测试覆盖

核心库测试包含：

| 模块       | 文件                          | 覆盖内容                                       |
| ---------- | ----------------------------- | ---------------------------------------------- |
| context    | `lib/context_test.ts`         | 错误类（AuthError, ValidationError, AppError） |
| middleware | `lib/middleware_test.ts`      | compose 编排、errorMiddleware 错误处理         |
| testing    | `lib/testing_test.ts`         | Mock 工厂、HTTP 辅助、断言                     |
| pg         | `lib/pg_test.ts`              | SQL 安全检查、quoteIdent                       |
| CORS       | `lib/plugins/cors_test.ts`    | 预检请求、CORS 头                              |
| Logging    | `lib/plugins/logging_test.ts` | requestId、日志 ctx                            |

### 代码检查

```bash
make lint
# 或
deno lint
```

### 格式化

```bash
make fmt
# 或
deno fmt
```

---

## MCP Agent 集成

### 连接配置

> MCP 仅在 `DENO_ENV=development` 时可用。请求经过 `plugins/auth/index.ts` 中的 `authMiddlewares` 处理，开发环境下由 `PGREST_JWT` 环境变量提供凭证。

#### Claude Code

创建或编辑 `~/.claude/mcp.json`：

```json
{
  "mcpServers": {
    "oct-edge-functions": {
      "type": "sse",
      "url": "http://localhost:18080/mcp/sse"
    }
  }
}
```

#### Cursor

在 Cursor Settings → MCP 中添加：

```json
{
  "oct-edge-functions": {
    "type": "sse",
    "url": "http://localhost:18080/mcp/sse"
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
      "url": "http://localhost:18080/mcp/sse"
    }
  }
}
```

#### 通用 HTTP 测试

```bash
# 1. 建立 SSE 会话
curl -N http://localhost:18080/mcp/sse

# 返回：
# event: endpoint
# data: {"uri":"/mcp/message?session_id=xxx"}

# 2. 调用 tool
curl -X POST \
  -H "Content-Type: application/json" \
  "http://localhost:18080/mcp/message?session_id=xxx" \
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

### Agent 工作流

#### 1. 创建函数

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

## Makefile 命令

| 命令                 | 说明                     |
| -------------------- | ------------------------ |
| `make build`         | 构建 Docker 镜像         |
| `make up`            | 启动服务                 |
| `make down`          | 停止服务                 |
| `make export`        | 导出镜像为 tar           |
| `make logs`          | 查看日志                 |
| `make dev`           | 本地 Deno 开发 (--watch) |
| `make test`          | 运行测试                 |
| `make test FILE=xxx` | 运行单个测试文件         |
| `make lint`          | 代码检查                 |
| `make fmt`           | 格式化代码               |
| `make check`         | 类型检查 + lint (CI)     |
| `make core-publish-check` | 检查 core 包 JSR 发布内容   |
| `make core-publish`   | 发布 @oct-edge-fns/core 到 JSR |
| `make core-version V=x.y.z` | 更新 core 包版号 |
| `make core-link DIR=path` | 链接本地 lib/ 到目标项目的 import map |
| `make core-unlink DIR=path` | 移除本地链接，恢复 JSR 引用 |
| `make cli-pack`       | 打包 CLI 脚手架 npm tarball |
| `make cli-publish`    | 发布 CLI 到 npm           |
| `make cli-version V=x.y.z` | 更新 CLI 版号      |
| `make publish-all`    | 全部发布 (core + CLI)     |
| `make clean`          | 清理容器和镜像            |
| `make status`         | 查看状态                  |

---

## 发布

### @oct-edge-fns/core (JSR)

核心运行时库 `@oct-edge-fns/core` 发布到 [jsr.io](https://jsr.io)。

配置在 `lib/deno.json` 中。

```bash
# 检查发布内容
make core-publish-check

# 发布到 JSR（本地机器自动使用浏览器认证）
# 可选：设置 JSR_TOKEN 可跳过浏览器交互
# export JSR_TOKEN="your_jsr_token"
make core-publish

# 更新版本号并打 tag
make core-version V=0.2.0
```

用户引用方式：
```json
{
  "imports": {
    "@oct-edge-fns/core": "jsr:@oct-edge-fns/core@^0.1"
  }
}
```

### create-oct-edge-fns (npm)

CLI 脚手架发布到 [npm](https://npmjs.com)。

```bash
# 打包为 tarball
make cli-pack

# 发布到 npm（需要 npm login）
make cli-publish

# 更新版本号
make cli-version V=0.2.0
```

### 全部发布

```bash
make publish-all CORE_VERSION=0.1.0 CLI_VERSION=0.1.0
```

---

## 环境变量

| 变量              | 默认值                  | 说明                                      |
| ----------------- | ----------------------- | ----------------------------------------- |
| `DENO_ENV`        | `development`           | `development` 开启 MCP，`production` 关闭 |
| `PORT`            | `18080`                 | 服务端口                                  |
| `FUNCTIONS_DIR`   | `./functions`           | 函数目录                                  |
| `PGREST_URL`      | `http://localhost:3000` | PostgREST 地址                            |
| `PGREST_SCHEMA`   | `public`                | 数据库 schema                             |
| `PGREST_JWT`      | -                       | PostgREST JWT（开发环境，不可用于生产）       |
| `CORS_ORIGIN`     | `*`                     | 跨域来源                                  |
| `LOG_LEVEL`       | `info`                  | 日志级别                                  |
| `LOG_DIR`         | `./logs`                | 日志目录                                  |

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

### Dockerfile 特性

- **多阶段构建**：builder 阶段预缓存依赖，减少最终镜像体积
- **HEALTHCHECK**：容器健康检查，每 30s 检测 / 端点
- **非 root 运行**：使用 `deno` 用户运行

---

## HTTP API 文档

### 通用规范

- **Base URL**: `http://localhost:18080`
- **鉴权**: 由 `plugins/auth/index.ts` 中的 `authMiddlewares` 处理（详细见[认证架构](#认证架构)）
- **Content-Type**: `application/json`

### 现有 Endpoints

#### GET /users

查询用户列表或单个用户。

**Query 参数**:

| 参数 | 类型   | 必填 | 说明                  |
| ---- | ------ | ---- | --------------------- |
| `id` | string | 否   | 用户 ID，传入则查单个 |

**响应示例**:

```json
// GET /users
[
  { "id": 1, "username": "alice", "email": "alice@example.com" },
  { "id": 2, "username": "bob", "email": "bob@example.com" }
]

// GET /users?id=1
{ "id": 1, "username": "alice", "email": "alice@example.com" }
```

**状态码**:

| 状态码 | 说明     |
| ------ | -------- |
| 200    | 成功     |
| 400    | 查询错误 |
| 401    | 未授权   |

---

#### POST /users

创建用户。

**请求体**:

```json
{
  "username": "charlie",
  "email": "charlie@example.com"
}
```

**响应示例**:

```json
[
  { "id": 3, "username": "charlie", "email": "charlie@example.com" }
]
```

**状态码**:

| 状态码 | 说明     |
| ------ | -------- |
| 201    | 创建成功 |
| 400    | 参数错误 |
| 401    | 未授权   |

---

#### PATCH /users

更新用户信息。

**Query 参数**:

| 参数 | 类型   | 必填 | 说明    |
| ---- | ------ | ---- | ------- |
| `id` | string | 是   | 用户 ID |

**请求体**:

```json
{
  "email": "new@example.com"
}
```

**响应示例**:

```json
[
  { "id": 1, "username": "alice", "email": "new@example.com" }
]
```

**状态码**:

| 状态码 | 说明              |
| ------ | ----------------- |
| 200    | 更新成功          |
| 400    | 参数错误或缺少 id |
| 401    | 未授权            |

---

#### DELETE /users

删除用户。

**Query 参数**:

| 参数 | 类型   | 必填 | 说明    |
| ---- | ------ | ---- | ------- |
| `id` | string | 是   | 用户 ID |

**响应示例**:

```json
[
  { "id": 1, "username": "alice", "email": "alice@example.com" }
]
```

**状态码**:

| 状态码 | 说明     |
| ------ | -------- |
| 200    | 删除成功 |
| 400    | 缺少 id  |
| 401    | 未授权   |

---

#### GET /inlet-org-tree

查询进水口组织架构树。

**响应示例**:

```json
[
  {
    "id": 1,
    "company_name": "总公司",
    "node_name": "总公司",
    "node_type": "根节点",
    "level_code": "01",
    "children": [
      {
        "id": "virtual_01/02",
        "company_name": "华东区",
        "node_name": "华东区",
        "node_type": "区域中心",
        "level_code": "01/02",
        "children": [
          {
            "id": 100,
            "company_name": "上海项目",
            "node_name": "上海项目",
            "node_type": "项目",
            "level_code": "01/02/001",
            "children": []
          }
        ]
      }
    ]
  }
]
```

**状态码**:

| 状态码 | 说明       |
| ------ | ---------- |
| 200    | 成功       |
| 401    | 未授权     |
| 500    | 服务器错误 |

---

### 通用错误响应

```json
{
  "error": "错误描述信息"
}
```

| HTTP 状态码 | 场景                         |
| ----------- | ---------------------------- |
| 400         | 请求参数错误、数据库操作失败 |
| 401         | 缺少或无效 Authorization     |
| 404         | 路由不存在                   |
| 405         | HTTP 方法不允许              |
| 500         | 服务器内部错误               |

---

### MCP Endpoints（Dev Only）

| 端点                          | 方法 | 说明                           |
| ----------------------------- | ---- | ------------------------------ |
| `/mcp/sse`                    | GET  | 建立 SSE 会话，返回 session_id |
| `/mcp/message?session_id=xxx` | POST | 发送 JSON-RPC 请求调用 tool    |

---

## 架构决策

详见 `docs/adr/`：

- [ADR-0001: MCP 集成](docs/adr/0001-mcp-integration.md)
- [ADR-0002: 函数注册表](docs/adr/0002-functions-registry.md)
