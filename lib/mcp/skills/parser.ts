/**
 * Parse SKILL.md frontmatter and instructions.
 */

import { parse as parseYaml } from "@std/yaml";
import type { SkillMeta } from "./types.ts";

export interface ParsedSkillMd {
  meta: SkillMeta;
  instructions: string;
}

export function parseSkillMd(content: string): ParsedSkillMd {
  const trimmed = content.trim();

  if (!trimmed.startsWith("---")) {
    return {
      meta: { name: "", description: "" },
      instructions: trimmed,
    };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return {
      meta: { name: "", description: "" },
      instructions: trimmed,
    };
  }

  const frontmatter = trimmed.slice(3, endIndex).trim();
  const instructions = trimmed.slice(endIndex + 3).trim();

  const parsed = parseYaml(frontmatter) as Record<string, unknown> || {};

  const meta: SkillMeta = {
    name: String(parsed.name || ""),
    description: String(parsed.description || ""),
    runtime: asRuntime(parsed.runtime),
    entry: parsed.entry ? String(parsed.entry) : undefined,
    source: asSource(parsed.source),
    inputs: asArray(parsed.inputs, asInputDef),
    outputs: asArray(parsed.outputs, asOutputDef),
    context_needed: asArray(parsed.context_needed, asContextNeeded),
    triggers: asTriggers(parsed.triggers),
    permissions: asPermissions(parsed.permissions),
  };

  return { meta, instructions };
}

function asRuntime(value: unknown): SkillMeta["runtime"] {
  if (value === "wasm" || value === "deno" || value === "python") {
    return value;
  }
  return undefined;
}

function asSource(value: unknown): SkillMeta["source"] {
  if (!value || typeof value !== "object") return undefined;
  const s = value as Record<string, unknown>;
  const type = s.type;
  if (
    type !== "mooncakes" && type !== "npm" && type !== "git" &&
    type !== "local"
  ) {
    return undefined;
  }
  return {
    type,
    package: s.package ? String(s.package) : undefined,
    version: s.version ? String(s.version) : undefined,
    url: s.url ? String(s.url) : undefined,
    git_url: s.git_url ? String(s.git_url) : undefined,
    path: s.path ? String(s.path) : undefined,
  };
}

function asArray<T>(
  value: unknown,
  mapper: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(mapper).filter((x): x is T => x !== undefined);
}

function asInputDef(
  value: unknown,
): { name: string; type: string; description?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (!item.name || !item.type) return undefined;
  return {
    name: String(item.name),
    type: String(item.type),
    description: item.description ? String(item.description) : undefined,
  };
}

function asOutputDef(
  value: unknown,
): { name: string; type: string; description?: string } | undefined {
  return asInputDef(value);
}

function asContextNeeded(
  value: unknown,
): { type: string; tables?: string[]; vars?: string[] } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (!item.type) return undefined;
  return {
    type: String(item.type),
    tables: Array.isArray(item.tables) ? item.tables.map(String) : undefined,
    vars: Array.isArray(item.vars) ? item.vars.map(String) : undefined,
  };
}

function asTriggers(value: unknown): SkillMeta["triggers"] {
  if (!value || typeof value !== "object") return undefined;
  const t = value as Record<string, unknown>;
  return {
    keywords: Array.isArray(t.keywords) ? t.keywords.map(String) : undefined,
    file_types: Array.isArray(t.file_types)
      ? t.file_types.map(String)
      : undefined,
  };
}

function asPermissions(value: unknown): SkillMeta["permissions"] {
  if (!value || typeof value !== "object") return undefined;
  const p = value as Record<string, unknown>;
  return {
    read: Array.isArray(p.read) ? p.read.map(String) : undefined,
    env: Array.isArray(p.env) ? p.env.map(String) : undefined,
    run: Array.isArray(p.run) ? p.run.map(String) : undefined,
  };
}
