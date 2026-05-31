import { ValidationError } from "../../lib/context.ts";
import type { Ctx } from "../../lib/context.ts";

// Template: transform
// Usage: Pure data computation with no external dependencies
// Implement your transformation logic below.

interface InputData {
  // TODO: define input schema
  [key: string]: unknown;
}

interface OutputData {
  // TODO: define output schema
  [key: string]: unknown;
}

function transform(input: InputData): OutputData {
  // TODO: implement transformation logic
  return input as OutputData;
}

export default async function handler(req: Request, _ctx: Ctx): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json();

    if (!body || typeof body !== "object") {
      throw new ValidationError("Request body must be an object");
    }

    const result = transform(body as InputData);
    return Response.json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
