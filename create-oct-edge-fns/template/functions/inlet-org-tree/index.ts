import { getInletOrgTree } from "./inlet.ts";
import { AuthError } from "../../lib/context.ts";
import type { Ctx } from "../../lib/context.ts";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!ctx.db) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  try {
    const tree = await getInletOrgTree(ctx.db);
    return Response.json(tree);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
