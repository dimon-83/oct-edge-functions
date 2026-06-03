import { assertEquals, assertRejects } from "@std/assert";
import {
  assertJsonResponse,
  assertStatus,
  buildRequest,
  createMockCtx,
  createMockDb,
  createMockLogger,
  runHandler,
} from "./testing.ts";

Deno.test("createMockLogger - all methods exist and are no-ops", () => {
  const logger = createMockLogger();
  assertEquals(typeof logger.debug, "function");
  assertEquals(typeof logger.info, "function");
  assertEquals(typeof logger.warn, "function");
  assertEquals(typeof logger.error, "function");
  logger.debug("test");
  logger.info("test", { key: "val" });
  logger.warn("warn");
  logger.error("err");
});

Deno.test("createMockDb - returns chainable query builder", async () => {
  const db = createMockDb();
  const qb = db.from("test_table");
  const result = await qb.select("*").eq("id", 1).single();
  assertEquals(result, { data: null, error: null });
});

Deno.test("createMockDb - with overrides", async () => {
  const db = createMockDb({
    single: () => Promise.resolve({ data: { id: 1 }, error: null }),
  });
  const result = await db.from("users").select("*").eq("id", 1).single();
  assertEquals(result, { data: { id: 1 }, error: null });
});

Deno.test("createMockCtx - provides defaults", () => {
  const ctx = createMockCtx();
  assertEquals(typeof ctx.db, "object");
  assertEquals(ctx.user?.id, 1);
  assertEquals(ctx.user?.username, "test");
  assertEquals(typeof ctx.requestId, "string");
  assertEquals(typeof ctx.log, "object");
});

Deno.test("createMockCtx - merges partial overrides", () => {
  const ctx = createMockCtx({ user: { id: 42, username: "custom" } });
  assertEquals(ctx.user?.id, 42);
  assertEquals(ctx.user?.username, "custom");
});

Deno.test("buildRequest - default GET /", () => {
  const req = buildRequest();
  assertEquals(req.method, "GET");
  assertEquals(new URL(req.url).pathname, "/");
});

Deno.test("buildRequest - with method, path, query", () => {
  const req = buildRequest({
    method: "POST",
    path: "/users",
    query: { page: "1" },
    body: { name: "test" },
  });
  assertEquals(req.method, "POST");
  const url = new URL(req.url);
  assertEquals(url.pathname, "/users");
  assertEquals(url.searchParams.get("page"), "1");
});

Deno.test("buildRequest - with custom headers", () => {
  const req = buildRequest({ headers: { "X-Custom": "val" } });
  assertEquals(req.headers.get("X-Custom"), "val");
});

Deno.test("runHandler - invokes handler with mock ctx", async () => {
  const handler = (_req: Request, _ctx: unknown) =>
    Promise.resolve(new Response("ok"));
  const res = await runHandler(handler, { method: "GET", path: "/test" });
  assertEquals(res.status, 200);
});

Deno.test("assertStatus - passes on matching status", () => {
  const res = new Response(null, { status: 201 });
  assertStatus(res, 201);
});

Deno.test("assertStatus - throws on mismatched status", () => {
  const res = new Response(null, { status: 400 });
  try {
    assertStatus(res, 200);
    throw new Error("should have thrown");
  } catch (e) {
    assertEquals((e as Error).message.includes("Expected status 200"), true);
  }
});

Deno.test("assertJsonResponse - passes on match", async () => {
  const res = new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
  await assertJsonResponse(res, { ok: true }, 200);
});

Deno.test("assertJsonResponse - throws on status mismatch", async () => {
  const res = new Response("bad", { status: 400 });
  await assertRejects(
    () => assertJsonResponse(res, {}, 200),
    Error,
    "Expected status 200",
  );
});

Deno.test("assertJsonResponse - throws on non-json content-type", async () => {
  const res = new Response("text", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  await assertRejects(
    () => assertJsonResponse(res, {}, 200),
    Error,
    "Expected JSON response",
  );
});
