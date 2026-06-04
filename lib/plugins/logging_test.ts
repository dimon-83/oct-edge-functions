import { assertEquals } from "@std/assert";
import { loggingMiddlewares } from "./logging.ts";

const loggingMiddleware = loggingMiddlewares[0];

Deno.test("logging - adds requestId and log to ctx", async () => {
  const ctx: Record<string, unknown> = {};
  const req = new Request("http://localhost/test");
  const res = await loggingMiddleware(
    req,
    ctx as Record<string, unknown>,
    () => Promise.resolve(new Response("ok", { status: 200 })),
  );
  assertEquals(res.status, 200);
  assertEquals(typeof ctx.requestId, "string");
  assertEquals(typeof ctx.log, "object");
});

Deno.test("logging - passes through response body", async () => {
  const ctx: Record<string, unknown> = {};
  const req = new Request("http://localhost/test");
  const res = await loggingMiddleware(
    req,
    ctx as Record<string, unknown>,
    () => Promise.resolve(new Response("hello world")),
  );
  assertEquals(await res.text(), "hello world");
});
