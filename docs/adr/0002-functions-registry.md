# ADR 0002: Functions Registry with Built-in Changelog

## Status

Accepted

## Context

Function lifecycle management requires tracking status, versions, and history.
We need a lightweight solution that doesn't depend on external services.

## Decision

Use a JSON file (`functions.json`) as the function registry with built-in
changelog:

```json
{
  "functions": [
    {
      "name": "users",
      "path": "functions/users",
      "status": "active",
      "version": "1.0.0",
      "created_at": "2024-01-15T08:00:00Z",
      "updated_at": "2024-06-01T10:30:00Z",
      "history": [
        {
          "version": "1.0.0",
          "status": "active",
          "changed_at": "2024-01-15T08:00:00Z",
          "reason": "Initial creation"
        }
      ]
    }
  ]
}
```

### Lifecycle States

| State        | Meaning                                    |
| ------------ | ------------------------------------------ |
| `draft`      | Code exists, tests incomplete              |
| `testing`    | Tests written, running verification        |
| `active`     | Tests passed, mounted as endpoint          |
| `deprecated` | Previously active, now offline             |
| `archived`   | Permanently offline, candidate for cleanup |

### Versioning

- Semver: `major.minor.patch`
- Bump types: `major` (breaking), `minor` (feature), `patch` (fix)
- Bumped on `deploy_function`

## Consequences

### Positive

- No external dependency
- Git-tracked for audit
- Human-readable
- Simple to backup/restore

### Negative

- File-level locking on concurrent writes (mitigated: single dev instance)
- No query capability (mitigated: small dataset, in-memory on load)

## Alternatives Considered

1. **Database table** — Rejected: adds dependency, overkill for metadata
2. **Git tags** — Rejected: doesn't track per-function status
3. **YAML** — Rejected: JSON is native to Deno/JS ecosystem
