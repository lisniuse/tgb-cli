#!/usr/bin/env bun
import pc from "picocolors";
import { createProgram } from "./cli.ts";
import { ApiError, LoginRequiredError, TgbError } from "./http.ts";

async function main(): Promise<void> {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (error instanceof LoginRequiredError) {
    console.error(pc.red("✗ ") + error.message);
    console.error("");
    console.error("请先登录 https://www.tgb.cn/ ，然后执行：");
    console.error(pc.cyan("  tgb login"));
    console.error(pc.dim("  或者：tgb login --cookie '<浏览器 Cookie 请求头>'"));
    process.exitCode = 1;
    return;
  }
  if (error instanceof ApiError) {
    console.error(pc.red("✗ ") + error.message);
    process.exitCode = 1;
    return;
  }
  if (error instanceof TgbError) {
    console.error(pc.red("✗ ") + error.message);
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red("✗ ") + message);
  if (process.env.DEBUG && error instanceof Error && error.stack) {
    console.error(pc.dim(error.stack));
  }
  process.exitCode = 1;
});
