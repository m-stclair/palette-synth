import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const strict = process.env.PALETTE_SYNTH_E2E_STRICT === "1";
let chromium;
try {
  ({chromium} = await import("@playwright/test"));
} catch (error) {
  const lines = [
    "[e2e] @playwright/test is not installed.",
    "[e2e] Install dependencies first with: npm install"
  ];

  if (strict) {
    console.error([...lines, "[e2e] Strict mode is on, so this is a failure."].join("\n"));
    process.exit(1);
  }

  console.log([...lines, "[e2e] Skipping Playwright smoke test in this environment."].join("\n"));
  process.exit(0);
}

const browserPath = chromium.executablePath();

if (!existsSync(browserPath)) {
  const lines = [
    `[e2e] Chromium is not installed at ${browserPath}.`,
    "[e2e] Install it with: npx playwright install chromium"
  ];

  if (strict) {
    console.error([...lines, "[e2e] Strict mode is on, so this is a failure."].join("\n"));
    process.exit(1);
  }

  console.log([...lines, "[e2e] Skipping Playwright smoke test in this environment."].join("\n"));
  process.exit(0);
}

const executable = resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright"
);

const command = existsSync(executable) ? executable : process.platform === "win32" ? "npx.cmd" : "npx";
const args = existsSync(executable) ? ["test"] : ["--no-install", "playwright", "test"];

const result = spawnSync(command, args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
