import { PostgrestClient } from "@supabase/postgrest-js";

const PGREST_URL = Deno.env.get("PGREST_URL") ?? "http://localhost:3000";
const PGREST_SCHEMA = Deno.env.get("PGREST_SCHEMA") ?? "public";

export function createClient(
  pgrestJwt: string,
  schema?: string,
): PostgrestClient {
  return new PostgrestClient(PGREST_URL, {
    headers: {
      apikey: pgrestJwt,
      Authorization: `Bearer ${pgrestJwt}`,
    },
    schema: schema ?? PGREST_SCHEMA,
  }) as PostgrestClient;
}
