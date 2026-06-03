import { assertEquals, assertRejects } from "@std/assert";
import { compose, errorMiddleware } from "./middleware.ts";
import type { Middleware } from "./middleware.ts";
import { AppError, AuthError, ValidationError } from "./context.ts";

Deno.test("compose - calls middlewares in order", async () => {
  const calls: number[] = [];
  const mw1: Middleware = async (_req, _ctx, next) => {
    calls.push(1);
    return await next();
  };
  const mw2: Middleware = async (_req, _ctx, next) => {
    calls.push(2);
    return await next();
  };
  const mw3: Middleware = (_req, _ctx, _next) => {
    calls.push(3);
    return new Response("ok");
  };
  const pipeline = compose([mw1, mw2, mw3]);
  const res = await pipeline(new Request("http://localhost"));
  assertEquals(calls, [1, 2, 3]);
  assertEquals(await res.text(), "ok");
});

Deno.test("compose - double next() yields no more middleware error", async () => {
  let callCount = 0;
  const mw: Middleware = async (_req, _ctx, next) => {
    callCount++;
    await next();
    return await next();
  };
  const pipeline = compose([mw]);
  await assertRejects(
    () => pipeline(new Request("http://localhost")),
    Error,
    "no more middleware",
  );
  assertEquals(callCount, 1);
});

Deno.test("errorMiddleware - passes through on success", async () => {
  const next = () => Promise.resolve(new Response("ok", { status: 200 }));
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ok");
});

Deno.test("errorMiddleware - catches AuthError as 401", async () => {
  const next = () => Promise.reject(new AuthError("bad token"));
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "bad token");
});

Deno.test("errorMiddleware - catches ValidationError as 400", async () => {
  const next = () => Promise.reject(new ValidationError("bad input"));
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "bad input");
});

Deno.test("errorMiddleware - catches AppError as 500", async () => {
  const next = () => Promise.reject(new AppError("server error"));
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "server error");
});

Deno.test("errorMiddleware - catches generic Error as 500", async () => {
  const next = () => Promise.reject(new Error("something broke"));
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "something broke");
});

Deno.test("errorMiddleware - catches string throw as 500", async () => {
  const next = () => Promise.reject("crash");
  const res = await errorMiddleware(new Request("http://localhost"), {}, next);
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "crash");
});
