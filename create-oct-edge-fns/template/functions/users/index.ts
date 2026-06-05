import { AuthError } from "../../lib/context.ts";
import type { Ctx } from "../../lib/context.ts";

export default async function handler(req: Request, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);

  if (!ctx.db) {
    throw new AuthError("Missing or invalid Authorization header");
  }

  try {
    switch (req.method) {
      case "GET": {
        const id = url.searchParams.get("id");
        ctx.log?.info("GET /users", { id });
        if (id) {
          const { data, error } = await ctx.db.from("app_user").select("*").eq("id", id).single();
          if (error) return Response.json({ error: error.message }, { status: 400 });
          return Response.json(data);
        }
        const { data, error } = await ctx.db.from("app_user").select("*");
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      case "POST": {
        const body = await req.json();
        const { data, error } = await ctx.db.from("app_user").insert(body).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data, { status: 201 });
      }

      case "PATCH": {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        const body = await req.json();
        const { data, error } = await ctx.db.from("app_user").update(body).eq("id", id).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      case "DELETE": {
        const id = url.searchParams.get("id");
        if (!id) return Response.json({ error: "id is required" }, { status: 400 });
        const { data, error } = await ctx.db.from("app_user").delete().eq("id", id).select();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json(data);
      }

      default:
        return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
