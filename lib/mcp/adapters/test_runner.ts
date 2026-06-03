import { join } from "@std/path";

export interface TestResult {
  exitCode: number;
  passed: number;
  failed: number;
  output: string;
}

export interface TestRunner {
  run(name?: string): Promise<TestResult>;
}

export class DenoTestRunner implements TestRunner {
  constructor(private readonly functionsDir: string = "./functions") {}

  async run(name?: string): Promise<TestResult> {
    const target = name
      ? join(this.functionsDir, name, "test.ts")
      : this.functionsDir;

    const cmd = new Deno.Command("deno", {
      args: ["test", "--allow-all", target],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    const output = new TextDecoder().decode(stdout) + "\n" +
      new TextDecoder().decode(stderr);

    const passed = output.match(/test result: ok\. (\d+) passed/)?.[1];
    const failed = output.match(
      /test result: FAILED\. (\d+) passed; (\d+) failed/,
    )?.[2];

    return {
      exitCode: code,
      passed: passed ? parseInt(passed) : 0,
      failed: failed ? parseInt(failed) : 0,
      output,
    };
  }
}

export class MockTestRunner implements TestRunner {
  private result: TestResult;

  constructor(overrides?: Partial<TestResult>) {
    this.result = {
      exitCode: 0,
      passed: 1,
      failed: 0,
      output: "test result: ok. 1 passed; 0 failed",
      ...overrides,
    };
  }

  run(_name?: string): Promise<TestResult> {
    return Promise.resolve(this.result);
  }
}
