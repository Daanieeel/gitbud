#!/usr/bin/env bun
/**
 * Checks bun.lock for packages installed at multiple versions.
 * Exits with code 1 if any duplicates are found (CI-safe).
 *
 * Usage:
 *   bun scripts/check-duplicate-deps.ts
 *   bun run check:duplicate-deps
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const lockfilePath = resolve(scriptDir, '../bun.lock');

let raw: string;
try {
	raw = readFileSync(lockfilePath, 'utf-8');
} catch {
	console.error(`${RED}[ERR]${RESET} Could not read ${lockfilePath}`);
	process.exit(1);
}

// bun.lock uses JSON5-like trailing commas — Bun's require() handles this.
// For a script context, strip trailing commas before parsing.
const sanitized = raw.replace(/,(\s*[}\]])/g, '$1');

let lockfile: {
	packages?: Record<string, [string, string, object, string]>;
};
try {
	lockfile = JSON.parse(sanitized);
} catch (err) {
	console.error(`${RED}[ERR]${RESET} Failed to parse bun.lock: ${err}`);
	process.exit(1);
}

const packages = lockfile.packages ?? {};

// Group resolved versions by package name.
// Keys in bun.lock are either "pkg-name" (top-level) or "parent/dep-name" (hoisted conflict).
// The actual resolved version is always in val[0] as "pkg-name@version".
const versionMap = new Map<string, Set<string>>();

for (const val of Object.values(packages)) {
	const resolved = val[0]; // e.g. "@babel/core@7.29.7" or "lodash@4.17.21"
	const match = resolved.match(/^(.+)@([^@]+)$/);
	if (!match) continue;
	const [, name, version] = match;
	if (!versionMap.has(name)) versionMap.set(name, new Set());
	versionMap.get(name)!.add(version);
}

const duplicates = [...versionMap.entries()]
	.filter(([, versions]) => versions.size > 1)
	.sort(([a], [b]) => a.localeCompare(b));

if (duplicates.length === 0) {
	console.log(
		`${GREEN}[OK]${RESET}   No duplicate dependency versions found.`
	);
	process.exit(0);
}

console.error(
	`\n${BOLD}${RED}Duplicate dependency versions detected${RESET} — this can cause bundle bloat and subtle runtime bugs in a monorepo.\n`
);
console.error(
	`${DIM}Prefer resolving these via "overrides" in the root package.json or by aligning catalog versions.${RESET}\n`
);

for (const [name, versions] of duplicates) {
	const vList = [...versions].join(`${RESET}, ${YELLOW}`);
	console.error(`  ${BOLD}${name}${RESET}  ${YELLOW}${vList}${RESET}`);
}

console.error(
	`\n${RED}[ERR]${RESET}  ${duplicates.length} package(s) with multiple versions. Fix the above before merging.\n`
);
process.exit(1);
