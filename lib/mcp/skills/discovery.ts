/**
 * Discover skills on the filesystem.
 */

import { join } from "@std/path";
import { parseSkillMd } from "./parser.ts";
import type {
  Skill,
  SkillInstall,
  SkillRegistryEntry,
  SkillSource,
} from "./types.ts";

export interface DiscoveryOptions {
  roots?: string[];
  registryEntries?: SkillRegistryEntry[];
}

const DEFAULT_ROOTS = [".claude/skills", "skills"];

export async function discoverSkills(
  options: DiscoveryOptions = {},
): Promise<Skill[]> {
  const roots = options.roots?.length ? options.roots : DEFAULT_ROOTS;
  const registryMap = new Map(
    (options.registryEntries || []).map((e) => [e.name, e]),
  );

  const skills: Skill[] = [];

  for (const root of roots) {
    try {
      const entries = await Deno.readDir(root);
      for await (const entry of entries) {
        if (!entry.isDirectory) continue;
        const skillDir = join(root, entry.name);
        const skill = await loadSkillFromDir(
          skillDir,
          registryMap.get(entry.name),
        );
        if (skill) {
          skills.push(skill);
        }
      }
    } catch {
      // Root does not exist or is not readable — skip.
    }
  }

  return skills;
}

async function loadSkillFromDir(
  dir: string,
  registryEntry?: SkillRegistryEntry,
): Promise<Skill | undefined> {
  const skillMdPath = join(dir, "SKILL.md");

  let content: string;
  try {
    content = await Deno.readTextFile(skillMdPath);
  } catch {
    return undefined;
  }

  const { meta, instructions } = parseSkillMd(content);
  const name = meta.name || basename(dir);

  const source: SkillSource = registryEntry?.source || meta.source || {
    type: "local",
    path: dir,
  };

  const install: SkillInstall = registryEntry?.install || {
    directory: dir,
  };

  return {
    name,
    path: dir,
    skill_md_path: skillMdPath,
    meta: {
      ...meta,
      name,
    },
    instructions,
    enabled: registryEntry?.enabled ?? false,
    source,
    install,
  };
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() || path;
}

export function toRegistryEntry(skill: Skill): SkillRegistryEntry {
  return {
    name: skill.name,
    enabled: skill.enabled,
    source: skill.source,
    install: skill.install,
  };
}
