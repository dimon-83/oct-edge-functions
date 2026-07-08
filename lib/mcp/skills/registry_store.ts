/**
 * Skill registry persistence.
 */

import type { SkillRegistry, SkillRegistryEntry } from "./types.ts";

export interface SkillRegistryStore {
  load(): Promise<SkillRegistry>;
  save(registry: SkillRegistry): Promise<void>;
}

export class FileSkillRegistryStore implements SkillRegistryStore {
  constructor(private readonly registryPath: string = "./skills.json") {}

  async load(): Promise<SkillRegistry> {
    try {
      const text = await Deno.readTextFile(this.registryPath);
      return JSON.parse(text) as SkillRegistry;
    } catch {
      return { version: "1.0.0", skills: [] };
    }
  }

  async save(registry: SkillRegistry): Promise<void> {
    await Deno.writeTextFile(
      this.registryPath,
      JSON.stringify(registry, null, 2),
    );
  }
}

export class InMemorySkillRegistryStore implements SkillRegistryStore {
  private registry: SkillRegistry = { version: "1.0.0", skills: [] };

  load(): Promise<SkillRegistry> {
    return Promise.resolve(JSON.parse(JSON.stringify(this.registry)));
  }

  save(registry: SkillRegistry): Promise<void> {
    this.registry = JSON.parse(JSON.stringify(registry));
    return Promise.resolve();
  }
}

export function mergeRegistryEntries(
  registered: SkillRegistryEntry[],
  discovered: SkillRegistryEntry[],
): SkillRegistryEntry[] {
  const map = new Map<string, SkillRegistryEntry>();

  for (const entry of registered) {
    map.set(entry.name, entry);
  }

  for (const entry of discovered) {
    if (!map.has(entry.name)) {
      map.set(entry.name, entry);
    }
  }

  return Array.from(map.values());
}
