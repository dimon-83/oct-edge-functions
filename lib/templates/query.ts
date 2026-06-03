import { AuthError } from "@oct-edge-fns-core/context.ts";
import type { Ctx } from "@oct-edge-fns-core/context.ts";

// Template: query
// Usage: Read-only data retrieval, possibly with transformation
// Replace {{TABLE_NAME}} and customize query logic.

const TABLE_NAME = "{{TABLE_NAME}}";

export default async function handler(
  req: Request,
  ctx: Ctx,
): Promise<Response> {
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (!ctx.db) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  try {
    const { data, error } = await ctx.db.from(TABLE_NAME).select("*");
    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // TODO: Add transformation logic here if needed
    const result = data ?? [];

    return Response.json(result);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
