import { PgDuckdbError } from "./errors.ts";
import type { CleanseRule, GovernanceRule, TableRef } from "./types.ts";

export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export function fullTableRef(ref: TableRef): string {
  const schema = ref.schema ?? "public";
  return `${quoteIdent(schema)}.${quoteIdent(ref.table)}`;
}

export function buildSyncQuery(
  source: TableRef,
  target: TableRef,
  where?: string,
): string {
  const whereClause = where ? `WHERE ${where}` : "";
  return `CREATE OR REPLACE TABLE ${fullTableRef(target)} AS
SELECT * FROM ${fullTableRef(source)} ${whereClause};`;
}

export function buildCleanseQuery(
  source: TableRef,
  target: TableRef,
  rules: CleanseRule[],
): string {
  if (rules.length === 0) {
    return buildSyncQuery(source, target);
  }

  const ctes = rules.map((rule, idx) =>
    `${quoteIdent(`step_${idx}`)} AS (${cleanseRuleToSql(rule, idx === 0 ? source : { table: `step_${idx - 1}` })})`
  );

  const lastStep = `step_${rules.length - 1}`;
  return `WITH ${ctes.join(",\n")}
CREATE OR REPLACE TABLE ${fullTableRef(target)} AS
SELECT * FROM ${quoteIdent(lastStep)};`;
}

function cleanseRuleToSql(rule: CleanseRule, source: TableRef): string {
  switch (rule.type) {
    case "deduplicate": {
      const cols = rule.columns.map(quoteIdent).join(", ");
      return `SELECT DISTINCT ON (${cols}) * FROM ${fullTableRef(source)} ORDER BY ${cols}`;
    }
    case "remove_nulls": {
      const conditions = rule.columns.map((c) =>
        `${quoteIdent(c)} IS NOT NULL`
      ).join(" AND ");
      return `SELECT * FROM ${fullTableRef(source)} WHERE ${conditions}`;
    }
    case "clamp": {
      const col = quoteIdent(rule.column);
      return `SELECT *, GREATEST(${rule.min}, LEAST(${rule.max}, ${col})) AS ${col}_clamped FROM ${fullTableRef(source)}`;
    }
    case "custom":
      return rule.sql;
    default:
      throw new PgDuckdbError(
        `Unsupported cleanse rule type`,
        "INVALID_RULE",
      );
  }
}

export function buildGovernanceQuery(
  target: TableRef,
  rule: GovernanceRule,
): { sql: string; passCondition: boolean } {
  switch (rule.type) {
    case "not_null": {
      return {
        sql: `SELECT COUNT(*) AS violation_count FROM ${fullTableRef(target)}
              WHERE ${rule.columns.map((c) => `${quoteIdent(c)} IS NULL`).join(" OR ")};`,
        passCondition: false,
      };
    }
    case "unique": {
      const cols = rule.columns.map(quoteIdent).join(", ");
      return {
        sql: `SELECT ${cols}, COUNT(*) AS cnt FROM ${fullTableRef(target)}
              GROUP BY ${cols} HAVING COUNT(*) > 1 LIMIT 10;`,
        passCondition: false,
      };
    }
    case "row_count_min": {
      return {
        sql: `SELECT COUNT(*) AS row_count FROM ${fullTableRef(target)};`,
        passCondition: true,
      };
    }
    case "custom": {
      return {
        sql: rule.sql,
        passCondition: rule.expected,
      };
    }
    default:
      throw new PgDuckdbError(
        `Unsupported governance rule type`,
        "INVALID_RULE",
      );
  }
}
