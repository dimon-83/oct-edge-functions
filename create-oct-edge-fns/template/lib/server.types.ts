import type { Ctx } from "./context.ts";

export type Pipeline = (req: Request) => Promise<Response>;

export interface FunctionModule {
  default?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
  handler?: (req: Request, ctx: Ctx) => Response | Promise<Response>;
}
