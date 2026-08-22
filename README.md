# GitBud

**A Git client that doesn't eat your RAM.**

GitBud is a desktop Git client with the workflow you already know from GitHub Desktop — repo sidebar, changes/history/PRs, stage-and-commit, one-click sync — rebuilt on Tauri instead of Electron. No bundled Chromium, no idle gigabyte of RAM, no multi-second cold start. Just your repos, fast.

It's also not trying to be GitHub-branded. Distinct dark-first design, a Vercel-inspired palette, and a git core written in Rust (`git2` + shelling out to your real `git`/`gh` for anything auth-related) so it never gets in the way of your actual toolchain.

## Features

- **Repo sidebar** — grouped by owner/remote, filterable, dirty-state and ahead/behind badges, right-click for terminal/Finder/copy-path actions
- **Changes tab** — stage/unstage whole files *or individual hunks*, discard changes (file or hunk), inline diff with real syntax highlighting, virtualized file list for huge repos
- **Merge conflicts** — dedicated resolution view: Use Mine / Use Theirs / edit manually / mark resolved
- **Commit** — summary + description that survives tab switches, amend last commit, protected-branch warnings
- **History** — virtualized commit log with a real `git log --graph`-style lane graph, cherry-pick, revert, create-branch-here, CI status and GPG/SSH verification badges
- **Branches** — create/rename/delete/merge from one popover, plus a merged-branch pruner
- **Pull Requests** — browse open/closed/all, create (with `.github/PULL_REQUEST_TEMPLATE.md` auto-load), checkout locally in one click, inline review comments, merge (merge/squash/rebase)
- **GitHub sign-in** — zero-config via detected `gh` CLI login, or Device Flow if you'd rather not install the CLI; GitHub Enterprise Server supported via a configurable host
- **Sync** — fetch/pull/push with live streamed output, configurable pull strategy, fork/upstream tracking with one-click fast-forward
- **Settings** — theme, git identity (global or per-repo), diff whitespace/font-size, sidebar sort, git binary override, filesystem-watch toggle

## Performance, not as an afterthought

These are the actual reasons this project exists:

- Idle RAM target: **under 150MB** with a repo open
- Cold start to interactive: **under 1 second**
- No polling, anywhere — repo state changes are pushed by filesystem events
- Every list (files, commits) is virtualized
- Diffs are computed in Rust and shipped as structured hunks, never raw file blobs

## Getting Started

**Prerequisites:** [Node.js](https://nodejs.org/) 18+, [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/Daanieeel/gitbud.git
cd gitbud
npm install

# run in dev mode (hot-reloads the frontend, rebuilds Rust on change)
npm run tauri dev

# build a release binary
npm run tauri build
```

Run the Rust test suite from `src-tauri/`:

```bash
cd src-tauri
cargo test
```

### GitHub features

Pull requests, checks, and review comments need a signed-in GitHub account. GitBud has no bundled OAuth credentials (it's not affiliated with GitHub) — the easiest path is having the [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`); GitBud will detect it automatically. Otherwise, sign in via Device Flow using your own [OAuth App](https://github.com/settings/applications/new) (Settings → GitHub).

## Architecture

- **Rust (`src-tauri/`)** — all git truth lives here: `git2` for status/diff/staging/commit/branch/history/hunks, system `git`/`gh` shelled out for anything touching auth (fetch/pull/push/clone), `notify` for debounced filesystem watching, OS keychain for GitHub tokens.
- **React + TypeScript (`src/`)** — a thin rendering layer over Tauri commands/events. Zustand stores per concern (repo state, GitHub, PRs, settings). No git logic on the frontend, by design — it should be replaceable without touching a single Rust file.

## Contributing

Issues and PRs welcome. A few ground rules to keep this project on-mission:

1. **RAM and cold-start numbers are acceptance criteria, not vibes.** If a change adds meaningful idle memory or startup time, it needs a reason.
2. **No polling.** State changes should be event-driven (filesystem watcher, Tauri events), not timers.
3. **Auth stays out of Rust.** Anything that needs a user's GitHub credentials for git operations (fetch/pull/push/clone) shells out to system `git`; only the GitHub *API* (PRs, checks, comments) talks HTTP directly, using tokens from Device Flow or `gh`.
4. **Keep the frontend dumb.** Git logic belongs in `src-tauri/`, not in a Zustand store.

This project doesn't have a license file yet — check back before assuming terms, or open an issue to ask.
