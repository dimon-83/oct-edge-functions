import { assertEquals } from "@std/assert";
import { createMockCtx } from "@oct-edge-fns/core/testing";
import handler from "./index.ts";

Deno.test("helloworld - should return hello message", async () => {
  const res = handler(new Request("http://localhost/helloworld"), createMockCtx());

  assertEquals(res.status, 200);

  const body = await res.json();
  assertEquals(body.message, "Hello, World!");
  assertEquals(typeof body.timestamp, "string");
});
