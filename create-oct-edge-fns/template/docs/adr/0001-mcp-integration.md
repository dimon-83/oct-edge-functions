# ADR 0001: MCP Integration for AI Coding Agents

## Status

Accepted

## Context

The oct-edge-functions project needs to support AI coding agents (Claude Code, Cursor, etc.) to:
- Automatically write edge functions based on requirements
- Run tests and validate implementations
- Manage function lifecycle (create, deploy, disable, archive)
- Build production artifacts

## Decision

Integrate MCP (Model Context Protocol) server directly into the dev runtime:

1. **Transport**: SSE over HTTP (`/mcp/sse`, `/mcp/message`)
2. **Session**: In-memory (sufficient for single-instance dev)
3. **Scope**: Dev environment only (`DENO_ENV=development`)
4. **Auth**: Reuse existing Bearer token middleware

### Tools Provided

| Tool | Purpose |
|------|---------|
| `create_function` | Generate from template (crud/query/proxy/transform) |
| `write_tests` | Auto-generate Deno test scaffold |
| `run_tests` | Execute tests, return report |
| `update_function` | Modify code (with auto lint) |
| `deploy_function` | Tests → semver bump → activate |
| `disable_function` | Soft-disable (deprecated) |
| `delete_function` | Archive (soft delete) |
| `publish_to_prod` | Validate + `make export ENV=prod` |

### TDD Workflow

```
Agent: create_function → write_tests → run_tests
  ↓ (fail)
Agent: update_function → run_tests (max 3 retries)
  ↓ (still fail)
→ Return NEED_USER_INPUT, pause for human
  ↓ (pass)
Agent: deploy_function (version_bump)
```

## Consequences

### Positive
- Single container for dev: HTTP API + MCP + function runtime
- Agent can fully automate function development
- `functions.json` registry provides audit trail

### Negative
- MCP adds complexity to main runtime
- In-memory sessions don't survive restart
- `deno lint` / `deno test` require Deno CLI in container

## Alternatives Considered

1. **Standalone MCP server** — Rejected: extra deployment, needs API to communicate with main service
2. **stdio transport** — Rejected: requires Agent to spawn process, less flexible for remote agents
3. **Git-based workflow** — Rejected: MCP doesn't operate git; `publish_to_prod` calls `make export` instead
