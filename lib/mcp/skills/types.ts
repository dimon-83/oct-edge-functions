/**
 * Skill domain types for MCP integration.
 */

export type SkillRuntime = "wasm" | "deno" | "python";

export type SkillSourceType = "mooncakes" | "npm" | "git" | "local";

export interface SkillSource {
  type: SkillSourceType;
  package?: string;
  version?: string;
  url?: string;
  git_url?: string;
  path?: string;
}

export interface SkillInstall {
  command?: string | null;
  directory?: string;
}

export interface SkillInputDef {
  name: string;
  type: string;
  description?: string;
}

export interface SkillOutputDef {
  name: string;
  type: string;
  description?: string;
}

export interface SkillContextNeeded {
  type: string;
  tables?: string[];
  vars?: string[];
}

export interface SkillTriggers {
  keywords?: string[];
  file_types?: string[];
}

export interface SkillPermissions {
  read?: string[];
  write?: string[];
  env?: string[];
  run?: string[];
  net?: string[];
}

export interface SkillMeta {
  name: string;
  description: string;
  runtime?: SkillRuntime;
  entry?: string;
  source?: SkillSource;
  inputs?: SkillInputDef[];
  outputs?: SkillOutputDef[];
  context_needed?: SkillContextNeeded[];
  triggers?: SkillTriggers;
  permissions?: SkillPermissions;
}

export interface Skill {
  name: string;
  path: string;
  skill_md_path: string;
  meta: SkillMeta;
  instructions: string;
  enabled: boolean;
  source: SkillSource;
  install: SkillInstall;
}

export interface SkillRegistryEntry {
  name: string;
  enabled: boolean;
  source: SkillSource;
  install: SkillInstall;
}

export interface SkillRegistry {
  version: string;
  skills_dir?: string;
  skills: SkillRegistryEntry[];
}

export interface SkillInvocationInput {
  name: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  timeout_ms?: number;
}
