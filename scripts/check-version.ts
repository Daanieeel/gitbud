#!/usr/bin/env bun
/**
 * Checks the desktop app version is not behind `main`, and that it's consistent across the
 * three files that carry it (package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml).
 * Meant to run first in CI so a forgotten version bump fails fast.
 *
 * Usage:
 *   bun scripts/check-version.ts
 *   bun run check:version
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const desktopDir = resolve(rootDir, "apps/desktop");

let ok = true;

function readJsonVersion(path: string): string {
  // SAFETY: caller passes a known desktop app config file whose shape always includes a
  // top-level "version" string; the check below guards against it being absent entirely.
  const raw = JSON.parse(readFileSync(path, "utf-8")) as { version?: string };
  if (!raw.version) throw new Error(`No "version" field in ${path}`);
  return raw.version;
}

function readCargoVersion(path: string): string {
  const raw = readFileSync(path, "utf-8");
  const match = raw.match(/^version = "([^"]+)"/m);
  if (!match) throw new Error(`No "version" field in ${path}`);
  return match[1];
}

const packageJsonPath = resolve(desktopDir, "package.json");
const tauriConfPath = resolve(desktopDir, "src-tauri/tauri.conf.json");
const cargoTomlPath = resolve(desktopDir, "src-tauri/Cargo.toml");

const currentVersion = readJsonVersion(packageJsonPath);
const tauriConfVersion = readJsonVersion(tauriConfPath);
const cargoVersion = readCargoVersion(cargoTomlPath);

if (tauriConfVersion !== currentVersion || cargoVersion !== currentVersion) {
  ok = false;
  console.error(`${RED}[ERR]${RESET}  Desktop app version is inconsistent across files:`);
  console.error(`  apps/desktop/package.json            ${currentVersion}`);
  console.error(`  apps/desktop/src-tauri/tauri.conf.json  ${tauriConfVersion}`);
  console.error(`  apps/desktop/src-tauri/Cargo.toml       ${cargoVersion}`);
  console.error(
    `${YELLOW}Run \`bun run version:bump:desktop <major|minor|patch|X.Y.Z>\` to fix.${RESET}\n`,
  );
} else {
  console.log(`${GREEN}[OK]${RESET}   Version consistent across files: ${currentVersion}`);
}

function readMainVersion(): string | null {
  try {
    execFileSync("git", ["fetch", "origin", "main", "--depth=1"], {
      cwd: rootDir,
      stdio: "ignore",
    });
  } catch {
    // No network / no origin remote (e.g. local dev) — fall through and try what's already local.
  }
  for (const ref of ["origin/main", "main"]) {
    try {
      const raw = execFileSync("git", ["show", `${ref}:apps/desktop/package.json`], {
        cwd: rootDir,
        encoding: "utf-8",
      });
      // SAFETY: the file being read is the same desktop package.json shape read above.
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      continue;
    }
  }
  return null;
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const mainVersion = readMainVersion();

if (mainVersion === null) {
  console.log(
    `${YELLOW}[SKIP]${RESET} Could not resolve main's version — skipping behind-main check.`,
  );
} else if (compareSemver(currentVersion, mainVersion) < 0) {
  ok = false;
  console.error(
    `${RED}[ERR]${RESET}  Desktop app version (${currentVersion}) is behind main (${mainVersion}).`,
  );
  console.error(
    `${YELLOW}Run \`bun run version:bump:desktop <major|minor|patch|X.Y.Z>\`.${RESET}\n`,
  );
} else {
  console.log(
    `${GREEN}[OK]${RESET}   Desktop app version (${currentVersion}) is not behind main (${mainVersion}).`,
  );
}

if (!ok) {
  console.error(`${BOLD}${RED}Version check failed.${RESET}`);
  process.exit(1);
}
