import type { Ctx } from "@oct-edge-fns/core";

export default function handler(_req: Request, ctx: Ctx): Response {
  ctx.log?.info("GET /helloworld");

  return Response.json({
    message: "Hello, World!",
    timestamp: new Date().toISOString(),
  });
}
