import type { Ctx } from "./context.ts";
import { AppError, AuthError, ValidationError } from "./context.ts";

// ------------------------------------------------------------------
// Mock factories
// ------------------------------------------------------------------

export interface MockLogger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

export function createMockLogger(): MockLogger {
  return {
    debug: (_msg, _meta) => {},
    info: (_msg, _meta) => {},
    warn: (_msg, _meta) => {},
    error: (_msg, _meta) => {},
  };
}

export interface MockDb {
  from: (table: string) => MockQueryBuilder;
  schema: (schema: string) => MockDb;
}

interface MockQueryBuilder {
  select: (columns?: string) => MockQueryBuilder;
  insert: (values: unknown[]) => MockQueryBuilder;
  update: (values: Record<string, unknown>) => MockQueryBuilder;
  delete: () => MockQueryBuilder;
  eq: (column: string, value: unknown) => MockQueryBuilder;
  order: (column: string, opts?: { ascending?: boolean }) => MockQueryBuilder;
  single: () => Promise<{ data: unknown; error: null | Error }>;
  schema: (_schema: string) => MockQueryBuilder;
}

export function createMockDb(
  overrides: Record<string, unknown> = {},
): MockDb {
  const emptyResult = { data: null, error: null };

  function createChildBuilder(
    parentOverrides: Record<string, unknown>,
  ): MockQueryBuilder & PromiseLike<{ data: unknown; error: unknown }> {
    const b = {
      select: (_columns?: string) => b,
      insert: (_values: unknown[]) => b,
      update: (_values: Record<string, unknown>) => b,
      delete: () => b,
      eq: (_column: string, _value: unknown) => b,
      order: (_column: string, _opts?: { ascending?: boolean }) => b,
      single: () =>
        Promise.resolve(
          "single" in parentOverrides
            ? (parentOverrides.single as () => Promise<{
              data: unknown;
              error: unknown;
            }>)()
            : emptyResult,
        ),
      schema: (_schema: string) => b,
      then: (
        onfulfilled: (value: { data: unknown; error: unknown }) => unknown,
      ) =>
        Promise.resolve(
          "data" in parentOverrides
            ? { data: parentOverrides.data, error: null }
            : emptyResult,
        ).then(onfulfilled),
    };
    return b as
      & MockQueryBuilder
      & PromiseLike<{
        data: unknown;
        error: unknown;
      }>;
  }

  return {
    from: (_table: string) => createChildBuilder(overrides),
    schema: (_schema: string) =>
      ({
        from: (_table: string) => createChildBuilder(overrides),
        schema: () => ({
          from: (_t: string) => createChildBuilder(overrides),
          schema: () => ({}) as MockDb,
        }),
      }) as MockDb,
  } as unknown as MockDb;
}

export function createMockCtx(partial: Partial<Ctx> = {}): Ctx {
  return {
    db: partial.db ?? createMockDb() as unknown as Ctx["db"],
    user: partial.user ?? { id: 1, username: "test" },
    requestId: partial.requestId ?? crypto.randomUUID(),
    log: partial.log ?? createMockLogger(),
  };
}

// ------------------------------------------------------------------
// HTTP test helpers
// ------------------------------------------------------------------

export interface HandlerRequestOptions {
  method?: string;
  path?: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export function buildRequest(options: HandlerRequestOptions = {}): Request {
  const {
    method = "GET",
    path = "/",
    query = {},
    body,
    headers = {},
  } = options;

  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const init: RequestInit = { method };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = {
      "Content-Type": "application/json",
      ...headers,
    };
  } else {
    init.headers = headers;
  }

  return new Request(url.toString(), init);
}

export async function runHandler(
  handler: (req: Request, ctx: Ctx) => Response | Promise<Response>,
  options: HandlerRequestOptions & { ctx?: Partial<Ctx> } = {},
): Promise<Response> {
  const { ctx: ctxPartial, ...reqOptions } = options;
  const req = buildRequest(reqOptions);
  const ctx = createMockCtx(ctxPartial);
  return await handler(req, ctx);
}

// ------------------------------------------------------------------
// Assertion helpers
// ------------------------------------------------------------------

export async function assertJsonResponse(
  response: Response,
  expected: unknown,
  expectedStatus = 200,
): Promise<void> {
  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}. Body: ${body}`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON response, got content-type: ${contentType}`,
    );
  }

  const body = await response.json();
  const actual = JSON.stringify(body);
  const exp = JSON.stringify(expected);

  if (actual !== exp) {
    throw new Error(`Expected ${exp}, got ${actual}`);
  }
}

export function assertStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}`,
    );
  }
}

// Re-export errors for test convenience
export { AppError, AuthError, ValidationError };
