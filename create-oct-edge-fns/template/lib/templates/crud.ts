import { AuthError, ValidationError } from "@oct/context.ts";
import type { Ctx } from "@oct/context.ts";

// Template: crud
// Usage: Single-table REST CRUD backed by ctx.db
// Replace {{TABLE_NAME}} with your actual table name.

const TABLE_NAME = "{{TABLE_NAME}}";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);

  if (!ctx.db) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  try {
    switch (req.method) {
      case "GET": {
        const id = url.searchParams.get("id");
        ctx.log?.info(`GET /${TABLE_NAME}`, { id });
        if (id) {
          const { data, error } = await ctx.db.from(TABLE_NAME).select("*").eq("id", id).single();
          if (error) return Response.json({ error: error.message }, { status: 400 });
          return Response.json(data);
        }
        const { data, error } = await ctx.db.from(TABLE_NAME).select("*");
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      case "POST": {
        const body = await req.json();
        const { data, error } = await ctx.db.from(TABLE_NAME).insert(body).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data, { status: 201 });
      }

      case "PATCH": {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        const body = await req.json();
        const { data, error } = await ctx.db.from(TABLE_NAME).update(body).eq("id", id).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      case "DELETE": {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        const { data, error } = await ctx.db.from(TABLE_NAME).delete().eq("id", id).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      default:
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (err) {
    if (err instanceof AuthError || err instanceof ValidationError) throw err;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
