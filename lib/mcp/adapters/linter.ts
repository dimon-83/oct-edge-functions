export interface LintResult {
  success: boolean;
  output: string;
}

export interface Linter {
  lint(filePath: string): Promise<LintResult>;
}

export class DenoLinter implements Linter {
  async lint(filePath: string): Promise<LintResult> {
    const cmd = new Deno.Command("deno", {
      args: ["lint", filePath],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(stdout) + "\n" +
      new TextDecoder().decode(stderr);

    return { success: code === 0, output };
  }
}

export class MockLinter implements Linter {
  private result: LintResult;

  constructor(overrides?: Partial<LintResult>) {
    this.result = { success: true, output: "", ...overrides };
  }

  lint(_filePath: string): Promise<LintResult> {
    return Promise.resolve(this.result);
  }
}
