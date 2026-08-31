#!/usr/bin/env bun
// react-flagpack's own CLI blindly copies its *entire* `dist/flags` directory — every flag at
// all three sizes (s/m/l), each one under three filename aliases (ISO numeric, alpha-2, alpha-3)
// plus a handful of subdivision flags (e.g. "GB-ENG.svg") — about 2250 files, 14MB. The timezone
// picker only ever renders `size="s"` by alpha-2 code, so this copies just that ~230-file, 1.2MB
// subset into `public/flags/s` instead. Run via the `postinstall` script in package.json, same
// as react-flagpack's own README recommends for its CLI.

import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(import.meta.dir, "..");
const destDir = path.join(projectRoot, "public", "flags", "s");

const pkgJsonUrl = import.meta.resolve("react-flagpack/package.json");
const pkgDir = path.dirname(fileURLToPath(pkgJsonUrl));
const sourceDir = path.join(pkgDir, "dist", "flags", "s");

rmSync(path.join(projectRoot, "public", "flags"), { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const entry of readdirSync(sourceDir)) {
  // Alpha-2 country codes only (e.g. "US.svg") — skips the numeric/alpha-3 duplicates of the
  // same flag and the subdivision-flag extras (e.g. "GB-ENG.svg") nothing here references.
  if (!/^[A-Z]{2}\.svg$/.test(entry)) continue;
  copyFileSync(path.join(sourceDir, entry), path.join(destDir, entry));
  copied++;
}

// react-flagpack ships no plain "GB.svg" for the United Kingdom (only "GBR.svg"/"GB-UKM.svg",
// both the same Union Jack) — copied under its real alpha-3 name here, requested via that name
// through `flagAssetCode()` (src/lib/timezoneCountries.ts) rather than pretending it's "GB.svg".
copyFileSync(path.join(sourceDir, "GBR.svg"), path.join(destDir, "GBR.svg"));
copied++;

if (!existsSync(destDir) || copied === 0) {
  console.error("copy-flags: copied 0 files — react-flagpack's dist/flags/s may have moved");
  process.exit(1);
}
console.log(`copy-flags: copied ${copied} flag icons to public/flags/s`);
