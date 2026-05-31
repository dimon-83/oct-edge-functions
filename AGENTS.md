# Oct Edge Functions — Agent Guide

## Project Overview

Deno-based edge function runtime with MCP (Model Context Protocol) integration for AI coding agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    oct-edge-functions                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   HTTP API   │  │  MCP Server  │  │  Function    │      │
│  │   (prod)     │  │  (dev only)  │  │  Registry    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                   │              │
│         └─────────────────┴───────────────────┘              │
│                           │                                  │
│                    ┌──────────────┐                         │
│                    │  functions/  │                         │
│                    │  (handlers)  │                         │
│                    └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `main.ts` | Entry point. Loads functions, mounts routes, conditionally enables MCP |
| `functions.json` | Function registry — status, version, changelog |
| `lib/mcp/server.ts` | MCP SSE server implementation |
| `lib/mcp/tools.ts` | MCP tool implementations (CRUD for functions) |
| `lib/mcp/session.ts` | In-memory session management |
| `lib/testing.ts` | Test scaffolding for agent-generated tests |
| `lib/templates/*.ts` | Code templates: crud, query, proxy, transform |

## Environment

- `DENO_ENV=development` — enables MCP endpoints
- `DENO_ENV=production` — MCP disabled, only HTTP API
- `FUNCTIONS_DIR` — function directory (default: `./functions`)
- `PORT` — server port (default: 8080)

## MCP Tools (Dev Only)

| Tool | Description |
|------|-------------|
| `list_functions` | List all functions with status/version |
| `get_function` | Get function metadata + source code |
| `create_function` | Create from template (crud/query/proxy/transform) |
| `write_tests` | Generate test scaffold |
| `run_tests` | Execute Deno tests |
| `update_function` | Update source code (with lint check) |
| `deploy_function` | Run tests, bump semver, set active |
| `disable_function` | Set status to deprecated |
| `delete_function` | Set status to archived (soft delete) |
| `publish_to_prod` | Validate + build prod Docker image |

## Function Lifecycle

```
draft → testing → active → deprecated → archived
   ↑_________|
```

Only `active` functions are mounted as HTTP endpoints.

## Coding Conventions

- Functions: `export default async function handler(req: Request, ctx: Ctx)`
- Errors: `AuthError`, `ValidationError`, `AppError` from `lib/context.ts`
- Database: `ctx.db` (PostgrestClient)
- Tests: Deno.test + `lib/testing.ts` helpers
