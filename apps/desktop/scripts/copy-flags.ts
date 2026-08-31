#!/usr/bin/env bun
// react-flagpack's own CLI blindly copies its *entire* `dist/flags` directory — every flag at
// all three sizes (s/m/l), each one under three filename aliases (ISO numeric, alpha-2, alpha-3)
// plus a handful of subdivision flags (e.g. "GB-ENG.svg") — about 2250 files, 14MB. The timezone
// picker only ever renders `size="s"` by alpha-2 code, so this copies just that ~230-file, 1.2MB
// subset into `public/flags/s` instead. Run via the `postinstall` script in package.json, same
// as react-flagpack's own README recommends for its CLI.

import { existsSync, mkdirSync, readdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// react-flagpack ships no European Union flag at all (there's no ISO 3166-1 code for it to hang
// off of) — "DEU.svg"/"REU.svg" only coincidentally contain "EU" as a substring (Germany, and
// Réunion). This is Twemoji's own EU flag artwork instead (real 5-pointed stars, not a
// simplified approximation) — its own 36x36 viewBox/intrinsic size doesn't need to match the
// other flags' 16x12: `Flag`'s `<img>` is sized by CSS (`width/height:100%` of its `.flag`
// container) with `object-fit: cover`, so any source SVG scales/crops to fit automatically.
const EU_FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="800px" height="800px" viewBox="0 0 36 36" aria-hidden="true" role="img" class="iconify iconify--twemoji" preserveAspectRatio="xMidYMid meet"><path fill="#039" d="M32 5H4a4 4 0 0 0-4 4v18a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4V9a4 4 0 0 0-4-4z"/><path d="M18.539 9.705l.849-.617h-1.049l-.325-.998l-.324.998h-1.049l.849.617l-.325.998l.849-.617l.849.617zm0 17.333l.849-.617h-1.049l-.325-.998l-.324.998h-1.049l.849.617l-.325.998l.849-.617l.849.617zm-8.666-8.667l.849-.617h-1.05l-.324-.998l-.325.998H7.974l.849.617l-.324.998l.849-.617l.849.617zm1.107-4.285l.849-.617h-1.05l-.324-.998l-.324.998h-1.05l.849.617l-.324.998l.849-.617l.849.617zm0 8.619l.849-.617h-1.05l-.324-.998l-.324.998h-1.05l.849.617l-.324.998l.849-.617l.849.617zm3.226-11.839l.849-.617h-1.05l-.324-.998l-.324.998h-1.05l.849.617l-.324.998l.849-.617l.849.617zm0 15.067l.849-.617h-1.05l-.324-.998l-.324.998h-1.05l.849.617l-.324.998l.849-.616l.849.616zm11.921-7.562l-.849-.617h1.05l.324-.998l.325.998h1.049l-.849.617l.324.998l-.849-.617l-.849.617zm-1.107-4.285l-.849-.617h1.05l.324-.998l.324.998h1.05l-.849.617l.324.998l-.849-.617l-.849.617zm0 8.619l-.849-.617h1.05l.324-.998l.324.998h1.05l-.849.617l.324.998l-.849-.617l-.849.617zm-3.226-11.839l-.849-.617h1.05l.324-.998l.324.998h1.05l-.849.617l.324.998l-.849-.617l-.849.617zm0 15.067l-.849-.617h1.05l.324-.998l.324.998h1.05l-.849.617l.324.998l-.849-.616l-.849.616z" fill="#FC0"/></svg>
`;

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

writeFileSync(path.join(destDir, "EU.svg"), EU_FLAG_SVG);
copied++;

if (!existsSync(destDir) || copied === 0) {
  console.error("copy-flags: copied 0 files — react-flagpack's dist/flags/s may have moved");
  process.exit(1);
}
console.log(`copy-flags: copied ${copied} flag icons to public/flags/s`);
