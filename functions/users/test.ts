import { assertStatus, runHandler } from "../../lib/testing.ts";
import handler from "./index.ts";

Deno.test("users - should handle GET", async () => {
  const res = await runHandler(handler, { method: "GET", path: "/users" });
  assertStatus(res, 200);
});

Deno.test("users - should handle POST", async () => {
  const res = await runHandler(handler, {
    method: "POST",
    path: "/users",
    body: {},
  });
  assertStatus(res, 201);
});

Deno.test("users - should handle PATCH", async () => {
  const res = await runHandler(handler, {
    method: "PATCH",
    path: "/users",
    query: { id: "1" },
    body: {},
  });
  assertStatus(res, 200);
});

Deno.test("users - should handle DELETE", async () => {
  const res = await runHandler(handler, {
    method: "DELETE",
    path: "/users",
    query: { id: "1" },
  });
  assertStatus(res, 200);
});
