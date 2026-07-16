# ADR 0005: pg-duckdb Toolkit for In-Database Analytics

## Status

Accepted

## Context

Child projects built with oct-edge-functions increasingly need to run
analytical workloads directly inside PostgreSQL using the `pg_duckdb` extension.
Concrete needs include:

- Checking whether the target database has `pg_duckdb` installed before running
  analytical SQL.
- Synchronizing data from PostgreSQL tables into DuckDB-backed tables for
  analytical querying.
- Cleansing raw data through DuckDB with structured, reusable rules.
- Running governance checks against analytical outputs and reporting violations.
- Tracking table-level data lineage so downstream tables remain traceable to
  their sources.
- Optionally queueing long-running analytical jobs through `pgmq` for
  asynchronous execution.

These capabilities are general enough to be provided by the framework rather
than reimplemented in every child project. At the same time, they are not
request middleware: they do not intercept HTTP requests like `cors` or
`rate-limit`. They are business-capability modules consumed by `functions/`,
`crons/`, and `skills/`.

## Decision

Introduce an **Official Toolkit** named `pg-duckdb` shipped as part of
`@oct-edge-fns/core` and exposed via `@oct-edge-fns/core/pg-duckdb`.

### 1. Toolkit vs Plugin

A **Toolkit** is distinct from a **Plugin**:

- A **Plugin** is HTTP request middleware mounted by `HttpServer`.
- A **Toolkit** is a collection of business-capability functions imported by
  handlers, cron jobs, skills, or MCP tools.

The pg-duckdb capability is a Toolkit because it performs database-backed
analytical operations, not request interception.

### 2. Execution Modes

The Toolkit supports two explicit SQL execution modes with no implicit fallback:

| Mode | Function | Transport | When to use |
| ---- | -------- | --------- | ----------- |
| RPC | `queryRpc(ctx, sql)` | `ctx.db.rpc(...)` via PostgREST | The database exposes the needed RPC functions; works with the existing `Ctx.db` client. |
| Direct | `queryDirect(sql, options)` | Direct PostgreSQL connection (`DATABASE_URL`) | Complex or ad-hoc SQL that is not wrapped in an RPC. |

Callers must choose the mode explicitly. The Toolkit never silently switches
from one mode to the other.

### 3. Required and Optional Dependencies

- **Required**: `pg_duckdb` PostgreSQL extension. The Toolkit provides
  `checkPgDuckdb(ctx)` and fails fast with a clear error if it is missing.
- **Optional**: `pgmq` PostgreSQL extension for asynchronous job queues. The
  Toolkit supports `queue: true` on high-level operations, but if `pgmq` is
  unavailable it throws an error rather than degrading to synchronous execution.

### 4. Metadata Schema

The Toolkit owns the following metadata tables. They are created explicitly via
`ensureSchema(ctx)` and are not auto-created at startup:

- `duckdb_jobs`: tracks analytical job state (`pending | running | succeeded |
  failed | cancelled`), full source SQL, target table, timing, optional
  `pgmq_msg_id`, and error messages.
- `duckdb_job_logs`: append-only state-change log for each job.
- `data_lineage`: table-level lineage records from one or more source tables to
  a target table.
- `data_lineage_sources`: many-to-many junction between lineage records and
  source tables.

Primary keys are `bigserial`.

### 5. High-Level Operations

The Toolkit exposes functional APIs for common operations. Every operation
creates a `duckdb_jobs` record and returns a job descriptor:

```typescript
const job = await sync(ctx, {
  mode: "rpc",
  source: { schema: "raw", table: "readings" },
  target: { schema: "analytics", table: "readings_duckdb" },
});

const report = await governanceCheck(ctx, {
  mode: "direct",
  target: { schema: "analytics", table: "readings_duckdb" },
  rules: [{ type: "not_null", columns: ["value"] }],
});
// report.passed, report.violations, report.error?.stack
```

Rules are structured objects rather than opaque strings for type safety and
extensibility:

```typescript
type CleanseRule =
  | { type: "deduplicate"; columns: string[] }
  | { type: "remove_nulls"; columns: string[] }
  | { type: "clamp"; column: string; min: number; max: number }
  | { type: "custom"; sql: string };

type GovernanceRule =
  | { type: "not_null"; columns: string[] }
  | { type: "unique"; columns: string[] }
  | { type: "row_count_min"; min: number }
  | { type: "custom"; sql: string; expected: boolean };
```

### 6. Asynchronous Jobs with pgmq

When `queue: true` is passed, the Toolkit enqueues the job through `pgmq` and
returns the job descriptor immediately. A worker cron (or manual invocation of
`processQueuedJobs(ctx)`) consumes the queue and executes jobs through a shared
`executeJob(ctx, jobId)` function. Whether queued or not, the same state machine
and logging path is used.

### 7. Lineage Tracking

High-level operations automatically record table-level lineage when a target
table is produced. Multi-source operations create one `data_lineage` row with
multiple `data_lineage_sources` rows.

### 8. MCP Tools

The MCP server exposes thin wrappers over the Toolkit so agents can trigger
analytical operations directly:

| Tool | Purpose |
| ---- | ------- |
| `pg_duckdb_check` | Verify `pg_duckdb` extension is installed. |
| `pg_duckdb_ensure_schema` | Initialize Toolkit metadata tables. |
| `pg_duckdb_sync` | Create a synchronization job. |
| `pg_duckdb_cleanse` | Create a cleansing job. |
| `pg_duckdb_governance_check` | Run governance checks and return a report. |
| `pg_duckdb_list_jobs` | List jobs and their statuses. |
| `pg_duckdb_process_queue` | Manually consume queued jobs. |

MCP tools construct a Toolkit `Ctx` from environment configuration and call the
same functions used by business code.

### 9. Out of Scope

The Toolkit intentionally does not handle:

- HTTP routing or request middleware (use `functions/` and Plugins).
- Cron scheduling (use the existing `crons/` framework).
- Data visualization or BI dashboards.
- Authorization or RLS policies (use the auth Plugin and database RLS).
- Backup, restore, or physical database administration.

## Consequences

### Positive

- Child projects get a consistent, versioned way to run DuckDB analytics inside
  PostgreSQL without owning the implementation.
- Table-level lineage and job audit logs are centralized in PostgreSQL metadata
  tables.
- Explicit RPC/direct modes avoid hidden behavior and make debugging easier.
- Optional `pgmq` integration lets heavy analytical workloads run asynchronously
  without complicating the synchronous path.
- MCP tool wrappers let agents discover and invoke analytical workflows.

### Negative

- The Toolkit introduces framework-owned metadata tables that must be
  initialized via `ensureSchema(ctx)`.
- Direct SQL mode requires an additional database connection string, increasing
  credential management surface.
- MCP tools need a way to construct a `Ctx` without an active HTTP request.
- Rule-to-SQL translation must be carefully reviewed to avoid injection when
  `custom` rules are used.

## Alternatives Considered

1. **Implement as a Plugin (middleware)** — Rejected: analytics operations are
   not request interceptors; forcing them into middleware would misuse the
   Plugin abstraction.
2. **Only support direct SQL** — Rejected: many deployments already expose
   PostgREST; supporting both RPC and direct maximizes compatibility.
3. **Auto-create metadata tables on first use** — Rejected: implicit DDL is
   surprising in production; explicit `ensureSchema(ctx)` keeps schema changes
   visible and controllable.
4. **Implement pgmq fallback to synchronous execution** — Rejected: silent
   behavior change when `pgmq` is missing violates the principle of explicit
   modes; callers must opt in to queuing.
5. **Expose rules as string arrays** — Rejected: structured objects are safer,
   self-documenting, and easier to validate and translate to SQL.
