# @oct-edge-fns/core

Edge function runtime core for Deno — server, middleware, MCP integration, plugins, and templates.

## Features

- **HttpServer** — configurable HTTP server with plugin pipeline and MCP support
- **Middleware** — composable middleware system (CORS, auth, logging)
- **MCP Tools** — Model Context Protocol integration for AI agent-driven function management
- **Templates** — scaffold new functions (CRUD, query, proxy, transform)
- **Testing** — mock helpers for unit testing edge functions
- **DB Client** — PostgREST and direct PostgreSQL clients

## Quick Start

```ts
import {
  HttpServer,
  corsMiddlewares,
  loggingMiddlewares,
  createAuthMiddlewares,
  envTokenProvider,
} from "@oct-edge-fns/core";

const plugins = [
  ...loggingMiddlewares,
  ...corsMiddlewares,
  ...createAuthMiddlewares(envTokenProvider),
];

const server = new HttpServer({
  port: 8080,
  functionsDir: "./functions",
  plugins,
  mcpEnabled: true,
});

await server.start();
```

## Exports

| Path | Description |
|------|-------------|
| `.` | All core exports |
| `./server` | HttpServer & ServerConfig |
| `./middleware` | Middleware compose & error handling |
| `./context` | Ctx type & error classes |
| `./logger` | LoggerFactory & log types |
| `./db` | PostgREST client factory |
| `./testing` | Mock helpers (buildRequest, createMockCtx, etc.) |
| `./pg` | Direct PostgreSQL client & SQL safety checks |
| `./auth` | Auth middleware & token provider |

## Function Lifecycle

```
draft → testing → active → deprecated → archived
   ↑_________|
```

Only `active` functions are mounted as HTTP endpoints.

## License

MIT
