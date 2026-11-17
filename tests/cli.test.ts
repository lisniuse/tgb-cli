import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const configHome = mkdtempSync(join(tmpdir(), "tgb-cli-test-"));

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "run", "src/index.ts", ...args],
    cwd: root,
    env: { ...process.env, ...extraEnv } as Record<string, string>,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

afterAll(() => {
  rmSync(configHome, { recursive: true, force: true });
});

describe("CLI 基础", () => {
  test("--version 输出版本号", () => {
    const result = run(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe("1.0.0");
  });

  test("help-all 包含主命令和 config 子命令", () => {
    const result = run(["help-all"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("命令: home");
    expect(result.stdout).toContain("命令: digest");
    expect(result.stdout).toContain("命令: config");
    expect(result.stdout).toContain("Usage: tgb config set");
  });

  test("tips 包含管道和多账号用法", () => {
    const result = run(["tips"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("TGB_CLI_HOME");
    expect(result.stdout).toContain("tgb reply");
    expect(result.stdout).toContain("TGB_COOKIE");
  });
});

describe("CLI 配置读写", () => {
  const env = { TGB_CLI_HOME: configHome };

  test("config path 使用 TGB_CLI_HOME", () => {
    const result = run(["config", "path"], env);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(join(configHome, "config.json"));
  });

  test("config set/show/unset", () => {
    expect(run(["config", "set", "delayMs", "123"], env).code).toBe(0);

    const shown = run(["config", "show", "--json"], env);
    expect(shown.code).toBe(0);
    const config = JSON.parse(shown.stdout) as { delayMs?: number };
    expect(config.delayMs).toBe(123);

    expect(run(["config", "unset", "delayMs"], env).code).toBe(0);
    const after = JSON.parse(run(["config", "show", "--json"], env).stdout) as { delayMs?: number };
    expect(after.delayMs).toBeUndefined();
  });
});
