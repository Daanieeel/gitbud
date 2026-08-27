#!/usr/bin/env bun
/**
 * Prints the current version of every app/package in the monorepo, alongside the latest
 * GitHub release, for an at-a-glance out-of-date check.
 *
 * Usage:
 *   bun scripts/version-info.ts
 *   bun run version:info
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");

// The only workspace package actually shipped as a GitHub Release — the rest (landing site,
// shared UI/config) sit at a static "0.0.0" and have nothing to compare against.
const RELEASED_PACKAGE = "@gitbud/desktop";
const REPO = "Daanieeel/gitbud";

interface WorkspacePackage {
  dir: string;
  name: string;
  version: string;
}

function readWorkspacePackage(dir: string): WorkspacePackage | null {
  try {
    // SAFETY: every workspace package.json has string "name"/"version" fields; the null checks
    // below only guard against a package that omits them entirely (both optional here).
    const raw = JSON.parse(readFileSync(resolve(rootDir, dir, "package.json"), "utf-8")) as {
      name?: string;
      version?: string;
    };
    if (!raw.name || !raw.version) return null;
    return { dir, name: raw.name, version: raw.version };
  } catch {
    return null;
  }
}

function listWorkspaceDirs(group: string): string[] {
  try {
    return readdirSync(resolve(rootDir, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(group, entry.name));
  } catch {
    return [];
  }
}

const packages = [...listWorkspaceDirs("apps"), ...listWorkspaceDirs("packages")]
  .map(readWorkspacePackage)
  .filter((pkg): pkg is WorkspacePackage => pkg !== null)
  .sort((a, b) => a.dir.localeCompare(b.dir));

async function fetchLatestReleaseVersion(): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;
  let res: Response;
  try {
    if (token) {
      res = await fetch(url, {
        headers: { "User-Agent": "gitbud-version-info", Authorization: `Bearer ${token}` },
      });
    } else {
      res = await fetch(url, { headers: { "User-Agent": "gitbud-version-info" } });
    }
  } catch {
    return null;
  }
  if (!res.ok) return null;
  // SAFETY: GitHub's releases/latest endpoint always returns an object with a tag_name string.
  const data = (await res.json()) as { tag_name?: string };
  return data.tag_name ? data.tag_name.replace(/^v/, "") : null;
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

const latestRelease = await fetchLatestReleaseVersion();

interface Row {
  dir: string;
  name: string;
  version: string;
  latest: string;
  status: string;
  statusColor: string;
}

const rows: Row[] = packages.map((pkg) => {
  if (pkg.name !== RELEASED_PACKAGE) {
    return {
      dir: pkg.dir,
      name: pkg.name,
      version: pkg.version,
      latest: "—",
      status: "unversioned",
      statusColor: DIM,
    };
  }
  if (!latestRelease) {
    return {
      dir: pkg.dir,
      name: pkg.name,
      version: pkg.version,
      latest: "unknown",
      status: "couldn't reach GitHub",
      statusColor: DIM,
    };
  }
  const cmp = compareSemver(pkg.version, latestRelease);
  let status = "up to date";
  let statusColor = GREEN;
  if (cmp > 0) {
    status = "ahead of latest release";
    statusColor = YELLOW;
  } else if (cmp < 0) {
    status = "behind latest release!";
    statusColor = RED;
  }
  return {
    dir: pkg.dir,
    name: pkg.name,
    version: pkg.version,
    latest: latestRelease,
    status,
    statusColor,
  };
});

const columns = [
  { key: "dir" as const, header: "Package" },
  { key: "name" as const, header: "Name" },
  { key: "version" as const, header: "Version" },
  { key: "latest" as const, header: "Latest Release" },
  { key: "status" as const, header: "Status" },
];

const widths = columns.map((col) =>
  Math.max(col.header.length, ...rows.map((row) => String(row[col.key]).length)),
);

function printRow(cells: string[], colors: (string | undefined)[]) {
  const line = cells
    .map((cell, i) => {
      const padded = cell.padEnd(widths[i]);
      const color = colors[i];
      return color ? `${color}${padded}${RESET}` : padded;
    })
    .join("  ");
  console.log(line);
}

const NO_COLOR = columns.map(() => undefined);

console.log(`${BOLD}gitbud workspace versions${RESET}\n`);
printRow(
  columns.map((c) => c.header),
  columns.map(() => BOLD),
);
printRow(
  widths.map((w) => "─".repeat(w)),
  NO_COLOR,
);
for (const row of rows) {
  printRow(
    columns.map((c) => String(row[c.key])),
    [...NO_COLOR.slice(0, -1), row.statusColor],
  );
}
console.log();
