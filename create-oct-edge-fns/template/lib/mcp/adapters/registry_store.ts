import { join } from "@std/path";
import { ToolResult } from "../types.ts";
import type { FunctionRegistry } from "../types.ts";

export interface RegistryStore {
  load(): Promise<FunctionRegistry>;
  save(registry: FunctionRegistry): Promise<void>;
}

export class FileRegistryStore implements RegistryStore {
  constructor(
    private readonly registryPath: string = "./functions.json",
    private readonly functionsDir: string = "./functions",
  ) {}

  async load(): Promise<FunctionRegistry> {
    try {
      const text = await Deno.readTextFile(this.registryPath);
      return JSON.parse(text) as FunctionRegistry;
    } catch {
      return { functions: [] };
    }
  }

  async save(registry: FunctionRegistry): Promise<void> {
    await Deno.writeTextFile(this.registryPath, JSON.stringify(registry, null, 2));
  }

  getFunctionsDir(): string {
    return this.functionsDir;
  }
}

export class InMemoryRegistryStore implements RegistryStore {
  private registry: FunctionRegistry = { functions: [] };

  async load(): Promise<FunctionRegistry> {
    return JSON.parse(JSON.stringify(this.registry));
  }

  async save(registry: FunctionRegistry): Promise<void> {
    this.registry = JSON.parse(JSON.stringify(registry));
  }
}
