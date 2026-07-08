/**
 * Install skills according to skills.json.
 */

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import type { SkillRegistryEntry } from "./types.ts";

export interface InstallResult {
  name: string;
  success: boolean;
  message?: string;
}

export async function installSkill(
  entry: SkillRegistryEntry,
  projectRoot = ".",
): Promise<InstallResult> {
  const command = entry.install?.command || defaultInstallCommand(entry);
  if (!command) {
    return {
      name: entry.name,
      success: true,
      message: "No install command required",
    };
  }

  const directory = entry.install?.directory ||
    defaultInstallDirectory(entry.name);
  const useNpx = isNpxSkillsCommand(command);

  if (!useNpx) {
    try {
      await ensureDir(directory);
    } catch (err) {
      return {
        name: entry.name,
        success: false,
        message: `Failed to create directory ${directory}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  }

  const cwd = useNpx ? projectRoot : directory;

  try {
    const result = await runShellCommand(command, cwd);
    if (!result.success) {
      return {
        name: entry.name,
        success: false,
        message: result.message,
      };
    }
    return {
      name: entry.name,
      success: true,
      message: result.message,
    };
  } catch (err) {
    return {
      name: entry.name,
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function defaultInstallDirectory(skillName: string): string {
  return join(".claude/skills", skillName);
}

export function defaultInstallCommand(
  entry: SkillRegistryEntry,
): string | null {
  const source = entry.source;
  const directory = entry.install?.directory ||
    defaultInstallDirectory(entry.name);

  switch (source.type) {
    case "mooncakes": {
      if (source.git_url) {
        return npxSkillsAddCommand(source.git_url);
      }
      if (!source.package || !source.version) return null;
      const skillMdUrl =
        `https://skills.mooncakes.io/skills/${source.package}@${source.version}/SKILL.md`;
      return `curl -fsSL ${skillMdUrl} -o ${join(directory, "SKILL.md")}`;
    }
    case "npm": {
      if (!source.package || !source.version) return null;
      return `npm install ${source.package}@${source.version} --prefix ${directory}`;
    }
    case "git": {
      if (!source.url) return null;
      return npxSkillsAddCommand(source.url);
    }
    case "local":
      return null;
    default:
      return null;
  }
}

function npxSkillsAddCommand(gitUrl: string): string {
  return `npx skills add ${gitUrl} --agent claude-code --copy --yes`;
}

function isNpxSkillsCommand(command: string): boolean {
  return command.trimStart().startsWith("npx skills add");
}

async function runShellCommand(
  command: string,
  cwd: string,
): Promise<{ success: boolean; message: string }> {
  const process = new Deno.Command("sh", {
    args: ["-c", command],
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const output = await process.output();
  const decoder = new TextDecoder();
  const stdout = decoder.decode(output.stdout).trim();
  const stderr = decoder.decode(output.stderr).trim();

  if (output.code !== 0) {
    return {
      success: false,
      message: stderr || stdout ||
        `Command failed with exit code ${output.code}`,
    };
  }

  return {
    success: true,
    message: stdout || stderr || "Installed successfully",
  };
}
