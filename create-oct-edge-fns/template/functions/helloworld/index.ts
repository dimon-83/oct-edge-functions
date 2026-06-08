import { AppError } from "@oct-edge-fns/core";
import type { Ctx } from "@oct-edge-fns/core";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  ctx.log?.info("GET /helloworld");

  try {
    return Response.json({
      message: "Hello, World!",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
