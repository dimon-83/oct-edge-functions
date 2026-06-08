import { runHandler, assertStatus } from "@oct-edge-fns/core/testing";
import handler from "./index.ts";

Deno.test("helloworld - should return hello message", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/helloworld" });
  assertStatus(res, 200);

  const body = await res.json();
  console.assert(body.message === "Hello, World!");
  console.assert(typeof body.timestamp === "string");
});
