<div align="center">

# GitBud

**A lightweight and fast Git client. Free forever, no catch.**

[![CI](https://github.com/Daanieeel/gitbud/actions/workflows/ci.yml/badge.svg)](https://github.com/Daanieeel/gitbud/actions/workflows/ci.yml)
[![Release](https://github.com/Daanieeel/gitbud/actions/workflows/release.yml/badge.svg)](https://github.com/Daanieeel/gitbud/actions/workflows/release.yml)
[![Product Page](https://api.netlify.com/api/v1/badges/e620c67b-254c-49ba-ac0c-f912ac97b125/deploy-status)](https://app.netlify.com/projects/gitbud-app/deploys)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![macOS · Windows · Linux](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-lightgrey)](#getting-started)

</div>

Your Git client shouldn't idle at a gigabyte of RAM just to show you a diff. GitBud gives you the workflow you already know (sidebar, changes, history, PRs, stage-and-commit, one-click sync) without the bundled Chromium tax. It's built on Tauri, not Electron, so it opens instantly and gets out of your way.

<div align="center">
<img src="resources/screenshots.png" alt="GitBud screenshots" width="900">
</div>

> **Status: early and moving fast.** GitBud is pre-1.0 and under active development. The core workflow (stage, commit, branch, sync, review PRs) is solid daily-driver territory, but expect rough edges elsewhere. This is a good time to open issues, suggest features, or send a PR that shapes where it goes next.

## Contents

- [Roadmap](#roadmap)
- [Features](#features)
- [Performance](#performance)
- [Getting Started](#getting-started)
  - [Download](#download)
  - [Build from source](#build-from-source)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

## Roadmap

Tracked as [GitHub Issues](https://github.com/Daanieeel/gitbud/issues), grouped under [milestones](https://github.com/Daanieeel/gitbud/milestones). Open an issue to propose something new or pick one up.

## Features

- Sidebar of repos grouped by owner/remote, filterable, with dirty-state and ahead/behind badges; right-click for terminal, Finder, or copy-path
- Stage, unstage, and discard whole files, individual hunks, or individual lines; syntax-highlighted diffs; virtualized file/commit lists
- Conflict resolution view: per-block accept-ours/accept-theirs, manual edit, or a raw-marker fallback
- Commit box with summary/description that persists across tab switches, one-click amend, a warning before committing to a protected branch
- History view with a `git log --graph`-style lane graph (with an optional compact mode that collapses merged-in branches), unpushed-commit indicator, cherry-pick, revert, create-branch-here, interactive rebase (reorder/squash/fixup/drop, with autosquash), and CI/GPG/SSH verification badges on each commit
- Branch create/rename/delete/merge from one popover, plus a one-click pruner for already-merged branches
- Pull request list, detail view, and creation (auto-loads `.github/PULL_REQUEST_TEMPLATE.md`), local checkout, inline review comments, and merge (merge/squash/rebase, with an option to change the target branch first)
- Sign-in via a detected `gh` CLI login or OAuth Device Flow; GitHub Enterprise Server supported
- Fetch/pull/push with streamed output, a choice of pull strategy, a resolve dialog for `--ff-only` pulls that hit diverging branches, and fork/upstream tracking
- Command palette with fuzzy matching across repos, branches, files, and commits
- Settings for theme, git identity (global or per-repo), diff whitespace/font-size/algorithm, sidebar sort, custom git binary path, and the filesystem watcher

## Performance

A few design choices that keep this lighter than the average Electron-based git client:

- Idle RAM target: under 50MB base + variable in-memory cached repo data (can be disabled via settings)
- Cold start to interactive: under a second
- Local repo state (status, log, branches) updates from filesystem events, not polling. Remote-facing data (open PRs, CI checks, a background fetch) is polled on a backoff schedule, since GitHub has no push channel for that
- File and commit lists are virtualized
- Diffs are computed in Rust and sent to the frontend as structured hunks, not raw file blobs

## Getting Started

### Download

Pre-built installers for macOS, Windows, and Linux are published on the [Releases page](https://github.com/Daanieeel/gitbud/releases) whenever a new version ships. They aren't code-signed yet, so your OS will warn you before the first launch. That's expected for a project this early, not a red flag.

**macOS:** you'll see `"GitBud.app" is damaged and can't be opened`. This is Gatekeeper blocking an unnotarized app, not actual corruption. Fix it by removing the quarantine flag:

```bash
xattr -cr /Applications/GitBud.app
```

### Build from source

**Prerequisites:** [Bun](https://bun.sh/), [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/Daanieeel/gitbud.git
cd gitbud
bun install

# run in dev mode (hot-reloads the frontend, rebuilds Rust on change)
bun run tauri dev

# build a release binary
bun run tauri build
```

Run the Rust test suite from `apps/desktop/src-tauri/`:

```bash
cd apps/desktop/src-tauri
cargo test
```

### GitHub features

Pull requests, checks, and review comments need a signed-in GitHub account. GitBud has no bundled OAuth credentials (it's not affiliated with GitHub). The easiest path is having the [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`); GitBud will detect it automatically. Otherwise, sign in via Device Flow using your own [OAuth App](https://github.com/settings/applications/new) (Settings > GitHub).

## Architecture

This is a Bun/Turborepo monorepo: the desktop app lives in `apps/desktop/`, with shared UI components and Tailwind theme in `packages/ui/`.

- **Rust (`apps/desktop/src-tauri/`)** holds all git truth: `git2` for status/diff/staging/commit/branch/history/hunks, system `git`/`gh` shelled out for anything touching auth (fetch/pull/push/clone), `notify` for debounced filesystem watching, OS keychain for GitHub tokens.
- **React + TypeScript (`apps/desktop/src/`)** is a thin rendering layer over Tauri commands/events. Zustand stores per concern (repo state, GitHub, PRs, settings). No git logic on the frontend, by design: it should be replaceable without touching a single Rust file.

## Contributing

Issues and PRs welcome. This is early enough that a well-argued PR can genuinely shape the roadmap. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md). A few ground rules to keep this project on-mission:

1. **RAM and cold-start numbers are acceptance criteria, not vibes.** If a change adds meaningful idle memory or startup time, it needs a reason.
2. **Local state stays event-driven.** Anything backed by the local `.git` (status, log, branches) should update from the filesystem watcher or Tauri events, not a timer. Remote-facing data (PRs, CI checks, background fetch) already polls on a backoff schedule since GitHub gives us no push channel for it; reuse that schedule instead of adding another timer.
3. **Auth stays out of Rust.** Anything that needs a user's GitHub credentials for git operations (fetch/pull/push/clone) shells out to system `git`; only the GitHub _API_ (PRs, checks, comments) talks HTTP directly, using tokens from Device Flow or `gh`.
4. **Keep the frontend dumb.** Git logic belongs in `apps/desktop/src-tauri/`, not in a Zustand store.

Every push and PR runs through [CI](.github/workflows/ci.yml): `cargo check` + `cargo test` on macOS, Windows, and Linux, plus a frontend typecheck, build, lint, and format check. Keep it green.

### Linting & formatting

JS/TS is linted and formatted with [Oxlint](https://oxc.rs)/[oxfmt](https://oxc.rs/docs/guide/usage/formatter), Rust with `clippy`/`rustfmt`. Run `bun run lint` / `bun run format` from the repo root to check/fix everything. VS Code and Zed users: the recommended extension ([`oxc.oxc-vscode`](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode) / [Oxc](https://zed.dev/extensions/oxc)) is preconfigured in `.vscode/` and `.zed/` to format on save.

## License

[GNU Affero General Public License v3.0 or later](LICENSE): free to use, modify, and redistribute (commercially or not), but any distributed or network-served version, including a modified or hosted one, must keep its source available under the same terms. It can never be relicensed as closed-source/proprietary.
