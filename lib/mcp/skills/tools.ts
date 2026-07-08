/**
 * MCP tool implementations for Skill management.
 */

import { discoverSkills, toRegistryEntry } from "./discovery.ts";
import { executeSkill } from "./executor.ts";
import { installSkill } from "./installer.ts";
import { mergeRegistryEntries } from "./registry_store.ts";
import type { SkillRegistryStore } from "./registry_store.ts";
import type {
  Skill,
  SkillRegistry,
  SkillRegistryEntry,
  SkillSourceType,
} from "./types.ts";
import type { ToolResult } from "../types.ts";

export interface SkillManagerDeps {
  registryStore: SkillRegistryStore;
  skillRoots?: string[];
}

export class SkillTools {
  constructor(private readonly deps: SkillManagerDeps) {}

  private async loadMerged(): Promise<
    { registry: SkillRegistry; skills: Skill[] }
  > {
    const registry = await this.deps.registryStore.load();
    const skills = await discoverSkills({
      roots: this.deps.skillRoots,
      registryEntries: registry.skills,
    });
    return { registry, skills };
  }

  async listSkills(): Promise<ToolResult> {
    const { skills } = await this.loadMerged();
    return {
      success: true,
      data: skills.map((s) => ({
        name: s.name,
        description: s.meta.description,
        runtime: s.meta.runtime,
        enabled: s.enabled,
        source: s.source,
      })),
    };
  }

  async getSkill(args: { name: string }): Promise<ToolResult> {
    const { skills } = await this.loadMerged();
    const skill = skills.find((s) => s.name === args.name);
    if (!skill) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Skill '${args.name}' not found` },
      };
    }

    return {
      success: true,
      data: {
        name: skill.name,
        path: skill.path,
        enabled: skill.enabled,
        meta: skill.meta,
        instructions: skill.instructions,
        source: skill.source,
        install: skill.install,
      },
    };
  }

  async registerSkill(args: {
    name: string;
    source_type: SkillSourceType;
    package?: string;
    version?: string;
    url?: string;
    git_url?: string;
    path?: string;
    install_command?: string;
    install_directory?: string;
    enabled?: boolean;
  }): Promise<ToolResult> {
    const registry = await this.deps.registryStore.load();

    if (registry.skills.find((s) => s.name === args.name)) {
      return {
        success: false,
        error: {
          code: "ALREADY_EXISTS",
          message: `Skill '${args.name}' is already registered`,
        },
      };
    }

    const entry: SkillRegistryEntry = {
      name: args.name,
      enabled: args.enabled ?? true,
      source: {
        type: args.source_type,
        package: args.package,
        version: args.version,
        url: args.url,
        git_url: args.git_url,
        path: args.path,
      },
      install: {
        command: args.install_command ?? null,
        directory: args.install_directory,
      },
    };

    registry.skills.push(entry);
    await this.deps.registryStore.save(registry);

    return { success: true, data: { entry } };
  }

  async unregisterSkill(args: { name: string }): Promise<ToolResult> {
    const registry = await this.deps.registryStore.load();
    const index = registry.skills.findIndex((s) => s.name === args.name);

    if (index === -1) {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Skill '${args.name}' not found in registry`,
        },
      };
    }

    registry.skills.splice(index, 1);
    await this.deps.registryStore.save(registry);

    return { success: true, data: { name: args.name } };
  }

  async installSkills(args: { name?: string } = {}): Promise<ToolResult> {
    const registry = await this.deps.registryStore.load();
    const entries = args.name
      ? registry.skills.filter((s) => s.name === args.name)
      : registry.skills;

    const results = [];
    for (const entry of entries) {
      const result = await installSkill(entry);
      results.push(result);
    }

    const failed = results.filter((r) => !r.success);
    return {
      success: failed.length === 0,
      data: { results },
    };
  }

  async invokeSkill(args: {
    name: string;
    inputs?: Record<string, unknown>;
    context?: Record<string, unknown>;
    timeout_ms?: number;
  }): Promise<ToolResult> {
    const { skills } = await this.loadMerged();
    const skill = skills.find((s) => s.name === args.name);

    if (!skill) {
      return {
        success: false,
        error: { code: "NOT_FOUND", message: `Skill '${args.name}' not found` },
      };
    }

    if (!skill.enabled) {
      return {
        success: false,
        error: {
          code: "DISABLED",
          message: `Skill '${args.name}' is not enabled`,
        },
      };
    }

    const result = await executeSkill(skill, {
      name: args.name,
      inputs: args.inputs,
      context: args.context,
      timeout_ms: args.timeout_ms,
    });

    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  async suggestSkill(args: {
    text?: string;
    file_name?: string;
    file_type?: string;
  }): Promise<ToolResult> {
    const { skills } = await this.loadMerged();
    const enabledSkills = skills.filter((s) => s.enabled);

    const text = [args.text || "", args.file_name || ""].join(" ")
      .toLowerCase();
    const fileType = (args.file_type || "").toLowerCase();

    const scored = enabledSkills.map((skill) => {
      let score = 0;
      const reasons: string[] = [];
      const triggers = skill.meta.triggers;

      if (triggers?.keywords) {
        for (const keyword of triggers.keywords) {
          if (text.includes(keyword.toLowerCase())) {
            score += 1;
            reasons.push(`matched keyword '${keyword}'`);
          }
        }
      }

      if (triggers?.file_types && fileType) {
        if (triggers.file_types.includes(fileType)) {
          score += 1;
          reasons.push(`matched file type '${fileType}'`);
        }
      }

      return { skill, score, reasons };
    });

    const sorted = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: sorted.map((s) => ({
        name: s.skill.name,
        description: s.skill.meta.description,
        confidence: Math.min(s.score / 3, 1),
        reasons: s.reasons,
      })),
    };
  }

  async syncRegistry(): Promise<ToolResult> {
    const registry = await this.deps.registryStore.load();
    const skills = await discoverSkills({
      roots: this.deps.skillRoots,
      registryEntries: registry.skills,
    });

    const discoveredEntries = skills.map(toRegistryEntry);
    const merged = mergeRegistryEntries(registry.skills, discoveredEntries);

    registry.skills = merged;
    await this.deps.registryStore.save(registry);

    return {
      success: true,
      data: { skills: merged.map((e) => e.name) },
    };
  }
}
