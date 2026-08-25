#!/usr/bin/env bun
// Bumps the app version everywhere it's hardcoded (package.json, src-tauri/Cargo.toml,
// src-tauri/tauri.conf.json) and refreshes Cargo.lock to match. Does not touch git — no commit,
// no tag. Usage: bun run version:bump <major|minor|patch|X.Y.Z>

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const arg = process.argv[2];

if (!arg || (!["major", "minor", "patch"].includes(arg) && !/^\d+\.\d+\.\d+$/.test(arg))) {
  console.error("Usage: bun run version:bump <major|minor|patch|X.Y.Z>");
  process.exit(1);
}

const packageJsonPath = path.join(root, "package.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const tauriConfPath = path.join(root, "src-tauri", "tauri.conf.json");

const currentVersion = JSON.parse(readFileSync(packageJsonPath, "utf8")).version as string;

function bump(version: string, kind: string): string {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const nextVersion = bump(currentVersion, arg);

function replaceJsonVersion(filePath: string) {
  const contents = readFileSync(filePath, "utf8");
  const updated = contents.replace(/"version":\s*"[^"]+"/, `"version": "${nextVersion}"`);
  if (updated === contents) throw new Error(`No "version" field found in ${filePath}`);
  writeFileSync(filePath, updated);
}

function replaceCargoTomlVersion(filePath: string) {
  const contents = readFileSync(filePath, "utf8");
  // Only the first `version = "..."` line, which is the package's own version at the top of the
  // file — dependency tables further down have their own `version = "..."` entries that must be
  // left alone.
  let replaced = false;
  const updated = contents.replace(/^version = "[^"]+"$/m, (match) => {
    if (replaced) return match;
    replaced = true;
    return `version = "${nextVersion}"`;
  });
  if (!replaced) throw new Error(`No "version" field found in ${filePath}`);
  writeFileSync(filePath, updated);
}

replaceJsonVersion(packageJsonPath);
replaceJsonVersion(tauriConfPath);
replaceCargoTomlVersion(cargoTomlPath);

try {
  execFileSync("cargo", ["check", "--quiet"], { cwd: path.join(root, "src-tauri"), stdio: "inherit" });
} catch {
  console.warn("Warning: `cargo check` failed — Cargo.lock may be out of sync, fix manually.");
}

console.log(`Bumped version: ${currentVersion} -> ${nextVersion}`);
console.log("Updated: package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock");
