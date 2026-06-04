import { assertEquals } from "@std/assert";
import { corsMiddlewares } from "./cors.ts";

const corsMiddleware = corsMiddlewares[0];

function makeReq(method: string, origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("http://localhost/test", { method, headers });
}

const passNext = () => Promise.resolve(new Response("ok", { status: 200 }));

Deno.test("cors - preflight OPTIONS returns 204 with headers", async () => {
  const req = makeReq("OPTIONS", "http://example.com");
  const res = await corsMiddleware(req, {}, passNext);
  assertEquals(res.status, 204);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "http://example.com",
  );
  assertEquals(
    res.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    res.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization, Accept",
  );
  assertEquals(res.headers.get("Access-Control-Max-Age"), "86400");
});

Deno.test("cors - adds CORS header to normal response", async () => {
  const req = makeReq("GET", "http://example.com");
  const res = await corsMiddleware(req, {}, passNext);
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "http://example.com",
  );
  assertEquals(res.headers.get("Vary"), "Origin");
});

Deno.test("cors - handles wildcard origin", async () => {
  const req = makeReq("GET", "http://any-origin.com");
  const res = await corsMiddleware(req, {}, passNext);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "http://any-origin.com",
  );
});

Deno.test("cors - no origin in request still works", async () => {
  const req = makeReq("GET");
  const res = await corsMiddleware(req, {}, passNext);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});
