import { runHandler, assertStatus } from "../../lib/testing.ts";
import handler from "./index.ts";

Deno.test("inlet-org-tree - should handle GET", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/inlet-org-tree" });
  assertStatus(res, 200);
});
