import handler from "./index.ts";

Deno.test("helloworld - should return hello message", async () => {
  const res = await handler(new Request("http://localhost/helloworld"), {
    params: {},
    env: (key: string) => Deno.env.get(key),
    waitUntil: () => {},
  });

  if (!res.ok) {
    throw new Error(`Expected 200, got ${res.status}`);
  }

  const body = await res.json();
  console.assert(body.message === "Hello, World!");
  console.assert(typeof body.timestamp === "string");
});
