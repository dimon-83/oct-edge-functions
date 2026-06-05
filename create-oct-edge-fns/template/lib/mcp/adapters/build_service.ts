export interface BuildResult {
  success: boolean;
  output: string;
}

export interface BuildService {
  buildProd(): Promise<BuildResult>;
}

export class MakeBuildService implements BuildService {
  async buildProd(): Promise<BuildResult> {
    const cmd = new Deno.Command("make", {
      args: ["export", "ENV=prod"],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(stdout) + "\n" + new TextDecoder().decode(stderr);

    return { success: code === 0, output };
  }
}

export class MockBuildService implements BuildService {
  private result: BuildResult;

  constructor(overrides?: Partial<BuildResult>) {
    this.result = { success: true, output: "", ...overrides };
  }

  async buildProd(): Promise<BuildResult> {
    return this.result;
  }
}
