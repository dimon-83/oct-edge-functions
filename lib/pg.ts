/**
 * Direct PostgreSQL connection utility for MCP tools.
 * Uses DATABASE_URL env var for connection.
 */

import { Pool } from "npm:pg@^8";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl = Deno.env.get("DATABASE_URL");
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL environment variable is required for pg_* tools. " +
        "Set it to a PostgreSQL connection string, e.g.: " +
        "postgresql://user:password@host:5432/database",
      );
    }
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export async function executeSql(
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql);
    return {
      rows: (result.rows ?? []) as Record<string, unknown>[],
      rowCount: result.rowCount ?? null,
    };
  } finally {
    client.release();
  }
}

export function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// SQL safety validation — strictly restricts dangerous operations
// ---------------------------------------------------------------------------

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
}

function stripComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

const DANGEROUS_PATTERNS = [
  // Object destruction
  /\bDROP\s+(TABLE|VIEW|SCHEMA|DATABASE|INDEX|FUNCTION|PROCEDURE|TRIGGER|RULE|POLICY|DOMAIN|TYPE|SEQUENCE|EXTENSION|MATERIALIZED\s+VIEW|FOREIGN\s+TABLE|SERVER|ROLE|USER|TABLESPACE|PUBLICATION|SUBSCRIPTION|TEXT\s+SEARCH|OWNED)\b/i,
  // Data destruction
  /\bTRUNCATE\b/i,
  // Privilege escalation / dangerous ALTER
  /\bALTER\s+(SYSTEM|DATABASE|ROLE|USER|TABLEGROUP|FOREIGN\s+DATA\s+WRAPPER|SERVER)\b/i,
  // Privileged creation
  /\bCREATE\s+(ROLE|USER|DATABASE|TABLESPACE)\b/i,
  // Privilege granting
  /\bGRANT\s+(ALL|pg_)/i,
  /\bREVOKE\s+(ALL|pg_)/i,
  // Admin operations that lock or disrupt
  /\bREINDEX\b/i,
  /\bCLUSTER\b/i,
  /\bVACUUM\b/i,
  // Dangerous built-in function calls
  /\bpg_sleep\s*\(/i,
  /\bpg_terminate_backend\s*\(/i,
  /\bpg_cancel_backend\s*\(/i,
];

const ALLOWED_TYPES_RE = /^[A-Za-z][A-Za-z0-9_() \t,]*$/;

export function checkRoutineBody(body: string): SafetyCheck {
  const cleaned = stripComments(body);
  for (const p of DANGEROUS_PATTERNS) {
    const m = cleaned.match(p);
    if (m) {
      return {
        safe: false,
        reason: `Dangerous SQL detected in function body: '${m[0]}' is not allowed. Destructive operations (DROP, TRUNCATE, ALTER SYSTEM, privilege changes, admin operations) are strictly prohibited.`,
      };
    }
  }
  return { safe: true };
}

export function checkViewQuery(query: string): SafetyCheck {
  const trimmed = query.trim();
  if (!/^(WITH\s+(RECURSIVE\s+)?|SELECT\s+)/i.test(trimmed)) {
    return {
      safe: false,
      reason: "View query must start with SELECT or WITH (CTE). This restriction prevents non-read-only operations.",
    };
  }
  const cleaned = stripComments(query);
  for (const p of DANGEROUS_PATTERNS) {
    const m = cleaned.match(p);
    if (m) {
      return {
        safe: false,
        reason: `Dangerous SQL detected in view query: '${m[0]}' is not allowed in a view definition.`,
      };
    }
  }
  return { safe: true };
}

export function checkColumnType(type: string): SafetyCheck {
  if (!ALLOWED_TYPES_RE.test(type.trim())) {
    return {
      safe: false,
      reason: `Invalid column type: '${type}'. Column type must be a valid PostgreSQL type name (e.g. INTEGER, VARCHAR(100), TIMESTAMPTZ).`,
    };
  }
  const cleaned = stripComments(type);
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(cleaned)) return { safe: false, reason: `Dangerous pattern in column type: '${type}'` };
  }
  return { safe: true };
}

export function checkDefaultValue(value: string): SafetyCheck {
  const cleaned = stripComments(value);
  for (const p of DANGEROUS_PATTERNS) {
    const m = cleaned.match(p);
    if (m) {
      return {
        safe: false,
        reason: `Dangerous SQL detected in DEFAULT value: '${m[0]}' is not allowed.`,
      };
    }
  }
  return { safe: true };
}

export function checkPolicyExpression(expr: string): SafetyCheck {
  const cleaned = stripComments(expr);
  for (const p of DANGEROUS_PATTERNS) {
    const m = cleaned.match(p);
    if (m) {
      return {
        safe: false,
        reason: `Dangerous SQL detected in policy expression: '${m[0]}' is not allowed.`,
      };
    }
  }
  return { safe: true };
}
