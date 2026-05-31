# Oct Edge Functions — Domain Glossary

> Canonical language for the oct-edge-functions platform.
> Implementation-free. Updated during grilling sessions.

---

## Core Concepts

### Function
An HTTP handler module deployed on the edge runtime. Represented as a directory under `functions/` containing at minimum an `index.ts` with a default export handler.

- **Name**: The directory name (e.g. `users`, `inlet-org-tree`). Serves as the canonical identifier.
- **Path**: The filesystem path relative to project root (e.g. `functions/users`).
- **Status**: Lifecycle state. One of `draft | testing | active | deprecated | archived`.
- **Version**: Semver string managed via `functions.json` changelog.

### Function Registry
The single source of truth for all function metadata. Stored at `functions.json` in the project root.

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
Reusable testing utilities in `lib/testing.ts` for constructing mock `Ctx`, building `Request` objects, invoking handlers, and asserting JSON responses.

### MCP Service
The Model Context Protocol (MCP) server embedded in the dev runtime. Exposes tools for agent-driven function lifecycle management.

- **Transport**: SSE over HTTP (`/mcp/sse`, `/mcp/message`).
- **Session**: In-memory session map (sufficient for single-instance dev).
- **Scope**: Dev environment only. Disabled in prod.

### Deploy (Dev)
Promoting a function from `testing` to `active` and bumping its semver in `functions.json`.

### Publish (Prod)
Validating all active functions pass tests, then building and exporting the production Docker image tar.

### Disable
Moving a function to `deprecated` status. Endpoint remains in codebase but is no longer mounted.

### Archive
Moving a function to `archived` status. Soft-delete; files remain for audit but function is permanently offline.

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
- The **MCP Service** manipulates **Functions**, **Tests**, and the **Registry**.
