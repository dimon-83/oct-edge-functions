import { runHandler, assertStatus } from "@oct-edge-fns/core/testing";
import handler from "./index.ts";

Deno.test("hello - should handle GET", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/hello" });
  assertStatus(res, 200);
});
