# Oct Edge Functions — Domain Glossary

> Canonical language for the oct-edge-functions platform. Implementation-free.
> Updated during grilling sessions.

---

## Core Concepts

### Function

An HTTP handler module deployed on the edge runtime. Represented as a directory
under `functions/` containing at minimum an `index.ts` with a default export
handler.

- **Name**: The directory name (e.g. `users`, `inlet-org-tree`). Serves as the
  canonical identifier.
- **Path**: The filesystem path relative to project root (e.g.
  `functions/users`).
- **Status**: Lifecycle state. One of
  `draft | testing | active | deprecated | archived`.
- **Version**: Semver string managed via `functions.json` changelog.

### Function Registry

The single source of truth for all function metadata. Stored at `functions.json`
in the project root.

- Tracks name, path, status, version, and full changelog history.
- Loaded at startup by the runtime to determine which functions to mount.
- Only functions with `status === "active"` are exposed as HTTP endpoints.

### Template

A code scaffold used by the coding agent to generate new functions consistently.

- **crud**: Single-table REST CRUD backed by `ctx.db`.
- **query**: Read-only data retrieval, possibly with transformation.
- **proxy**: HTTP forwarding to external services.
- **transform**: Pure data computation with no external dependencies.

### Test Scaffold

Reusable testing utilities in `lib/testing.ts` for constructing mock `Ctx`,
building `Request` objects, invoking handlers, and asserting JSON responses.

### MCP Service

The Model Context Protocol (MCP) server embedded in the dev runtime. Exposes
tools for agent-driven function lifecycle management.

- **Transport**: SSE over HTTP (`/mcp/sse`, `/mcp/message`).
- **Session**: In-memory session map (sufficient for single-instance dev).
- **Scope**: Dev environment only. Disabled in prod.

### Skill

A reusable domain capability package consumed by the MCP Service. A Skill
contains a `SKILL.md` with instructions for the agent and may optionally include
executable entry points (e.g. WASM, TypeScript, Python) for deterministic
automation.

- **Name**: Unique identifier, lowercase with hyphens, declared in `SKILL.md`
  frontmatter.
- **Description**: Natural language summary of when and how to use the Skill.
- **Runtime**: The execution environment required by the Skill's entry point.
  One of `wasm | deno | python`.
- **Entry**: Optional executable path relative to the Skill directory. When
  present, the MCP Service can invoke it directly via stdin/stdout JSON.
- **Source**: Where the Skill originates — a marketplace (e.g. mooncakes.io),
  npm-compatible package, git repository, or local path.

### Skill Registry

The single source of truth for installed and enabled Skills in a project.

- Tracks name, source, installation location, enabled status, and version.
- Used by the MCP Service to discover available Skills and by container
  initialization to install missing Skills.

### Skill Runtime

The execution environment responsible for running a Skill's entry point. The
MCP Service delegates to the appropriate runtime based on the Skill's declared
`runtime` field.

- Each runtime is pre-installed in the project's Docker image.
- The MCP Service performs startup checks to ensure declared runtimes are
  available.

### Official Plugin

A middleware plugin shipped and versioned as part of `@oct-edge-fns/core`. Child
projects import Official Plugins from `@oct-edge-fns/core/plugins` instead of
owning a copy of their source code.

- Examples: auth, cors, logging, rate-limit.
- Updates to Official Plugins are delivered through core version upgrades.

### Custom Plugin

A middleware plugin owned by a single child project and kept in the project's
`plugins/` directory. Custom Plugins coexist with Official Plugins but are not
managed by core releases.

### Project Upgrade

The process of moving a child project to a newer version of `@oct-edge-fns/core`.

- Updates the core import constraint in `deno.json`.
- Regenerates `deno.lock` to drop stale version pins.
- Removes any stale local `lib/` copy from earlier scaffolding.
- Re-caches remote dependencies.
- Does not modify business assets such as functions, crons, or skills.

### Deploy (Dev)

Promoting a function from `testing` to `active` and bumping its semver in
`functions.json`.

### Publish (Prod)

Validating all active functions pass tests, then building and exporting the
production Docker image tar.

### Disable

Moving a function to `deprecated` status. Endpoint remains in codebase but is no
longer mounted.

### Archive

Moving a function to `archived` status. Soft-delete; files remain for audit but
function is permanently offline.

---

## Lifecycle States

```
draft → testing → active → deprecated → archived
         ↑_________|
```

- **draft**: Function code exists, tests may be incomplete. Not mounted.
- **testing**: Tests written, running verification. Not mounted.
- **active**: Tests passed, mounted as HTTP endpoint.
- **deprecated**: Previously active, now offline. Retained for rollback.
- **archived**: Permanently offline. Candidate for future cleanup.

---

## Relationships

- One **Function** has one **Status** at any time.
- One **Function** has many **Changelog Entries** (in `functions.json`).
- One **Function** is generated from exactly one **Template**.
- The **Runtime** mounts zero or more **Functions** based on Registry + Status.
- The **MCP Service** manipulates **Functions**, **Tests**, and the
  **Registry**.

---

## Cron Framework

### System Cron Library

Platform library at `lib/cron/` providing the cron task framework. Users import via `@oct/core`.

### User Cron Job

Business cron tasks defined in `crons/` directory of user projects.

### Cron Task (Instance)

A `CronTask` instance returned by `cron()`, containing schedule expression and handler function.

### Scheduler

Component responsible for scanning `crons/` directory, registering `CronTask` instances to `croner` runtime, and managing lifecycle.

### Cron Registration

- Uses **function-wrapper** style: `export default cron({...})`
- Exported value is a `CronTask` instance, detectable via `instanceof CronTask`
- Scanner auto-discovers `crons/*.ts` (flat, skips `*.test.ts` / `_` prefix / subdirs)

### CronOptions Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schedule` | `string` | Yes | CRON expression |
| `handler` | `() => void \| Promise<void>` | Yes | Handler function |
| `name` | `string` | No | Task name (logging/monitoring), inferred from filename |
| `timezone` | `string` | No | IANA timezone, e.g. `"Asia/Shanghai"` |
| `maxRuns` | `number` | No | Max execution count |
| `paused` | `boolean` | No | Start paused |
| `context` | `Record<string, unknown>` | No | Context data |
| `retryOnFailure` | `number` | No | Retry count (0 = no retry) |
| `catch` | `(error, context) => void` | No | Error callback |

### Cron Task Status

```
registered → running → paused
                ↑          │
                └─ resume ─┘
                │
                └──→ stopped (stop / completed)
```

### Cron Log Format

| Event | Format |
|-------|--------|
| Task start | `[cron] <name> started (schedule: <expr>)` |
| Task complete | `[cron] <name> completed (took <ms>ms)` |
| Task failure | `[cron] <name> failed after <N> attempts: <message>` |

### Runtime

- Scheduling engine: `jsr:@hexagon/croner`
- Startup: user explicitly calls `await startCrons()` to trigger scan + registration
