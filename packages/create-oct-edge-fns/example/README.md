# example

Edge function runtime powered by [@oct-edge-fns/core](https://jsr.io/@oct-edge-fns/core).

## 快速开始

```bash
# 启动开发服务器
deno task dev

# 运行测试
deno task test

# Docker 构建
make build
```

## 项目结构

```
example/
├── main.ts                  # 入口
├── deno.json                # Deno 配置
├── Makefile                 # 快捷命令
├── Dockerfile               # 镜像构建
├── docker-compose.yml       # 容器编排
├── .env.example             # 环境变量模板
├── functions/               # 边缘函数
│   └── hello/               # 示例 CRUD 函数
│       ├── index.ts
│       └── test.ts
├── plugins/auth/            # 认证中间件
└── lib/                     # 自定义业务逻辑
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8080` | 服务端口 |
| `DENO_ENV` | `development` | 环境标识 |
| `PGREST_URL` | `http://localhost:3000` | PostgREST 地址 |
| `PGREST_SCHEMA` | `public` | 数据库 schema |
| `PGREST_JWT` | - | PostgREST JWT（开发环境） |
| `CORS_ORIGIN` | `*` | 跨域来源 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `LOG_DIR` | `./logs` | 日志目录 |

## 认证

默认读取 `PGREST_JWT` 环境变量。生产环境编辑 `plugins/auth/index.ts` 替换为安全实现。
