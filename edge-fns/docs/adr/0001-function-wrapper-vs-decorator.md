# ADR 0001: Function-wrapper style for cron task registration

**Date**: 2025-01-XX

**Status**: Accepted

## Context

The cron library needs a way for users to register a task with a schedule expression and a handler function. Two syntax styles were considered:

**Decorator syntax** (idealized):
```ts
@cron({ schedule: "0 8 * * *" })
export default async function dailyReport() { ... }
```

**Function-wrapper syntax** (chosen):
```ts
export default cron({
  schedule: "0 8 * * *",
  handler: async () => { ... },
});
```

The decorator syntax was preferred by the team for its readability and declarative style.

## Decision

Use the **function-wrapper** style instead of decorators.

## Rationale

JavaScript/TypeScript decorators (TC39 stage 3) only support **classes, methods, accessors, and properties** — they **cannot** decorate a standalone function declaration. Since cron tasks are naturally standalone functions rather than class methods, using a decorator would force an artificial class wrapper:

```ts
@cron({ schedule: "0 8 * * *" })
export default class {
  async handle() { ... }
}
```

This adds ceremony without benefit. The function-wrapper approach:

- Allows the task to remain a plain function
- `export default cron({...})` reads as a single declarative expression
- The returned `CronTask` instance is trivially detectable via `instanceof`
- Requires zero transpiler configuration (`experimentalDecorators`, etc.)

## Consequences

**Positive**:
- Simpler runtime — no decorator metadata reflection needed
- Portable across Deno, Node, and Bun without transpiler flags
- `instanceof CronTask` provides a reliable detection mechanism for the scanner

**Negative**:
- Slightly more verbose than decorator syntax (the `handler` key is redundant)
- Users familiar with NestJS / TypeORM decorators may initially expect `@cron()` syntax
- Name cannot be inferred from the function name, requiring stack-trace heuristics or explicit `name` field

## Alternatives considered

### Real decorator (rejected)
Requires a class wrapper. Adds cognitive overhead and makes the task look like a class when it's really a function.

### Export convention (rejected)
```ts
export const schedule = "0 8 * * *";
export default async function handler() { ... }
```
Two exports per task is fragile — easy to forget one or misname the export. Also harder to add options (timezone, retries, etc.).
