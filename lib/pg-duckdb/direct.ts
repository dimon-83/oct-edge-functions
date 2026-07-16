import { PgDuckdbError } from "./errors.ts";
import { PgClient } from "../pg.ts";
import type { DirectSqlOptions } from "./types.ts";

export async function queryDirect<T = unknown>(
  sql: string,
  options: DirectSqlOptions = {},
): Promise<T[]> {
  const url = options.url ?? Deno.env.get("DATABASE_URL");
  if (!url) {
    throw new PgDuckdbError(
      "DATABASE_URL is required for direct SQL mode",
      "DIRECT_CONNECTION_FAILED",
    );
  }

  const client = new PgClient(url);
  try {
    const { rows } = await client.executeSql(sql);
    return rows as T[];
  } catch (err) {
    throw new PgDuckdbError(
      `Direct SQL query failed: ${err instanceof Error ? err.message : String(err)}`,
      "DIRECT_CONNECTION_FAILED",
      err,
    );
  } finally {
    client.close();
  }
}
