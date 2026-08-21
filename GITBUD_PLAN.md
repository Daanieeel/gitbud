# GitBud — Build Plan

Name rationale: "git" + friendly/cute "bud" — short, approachable, distinct from GitHub's branding.

## Goal

Build a lightweight desktop Git client that replicates the **layout and workflow** of GitHub Desktop, but with:
- A distinct visual identity (shadcn/ui-inspired design system — not a GitHub skin)
- Dramatically lower idle RAM and CPU usage than the Electron-based original
- Only the features actually used day-to-day (see Non-Goals)

## Tech Stack

- **Shell:** Tauri v2. Uses the OS-native webview (WKWebView on macOS, WebView2 on Windows) instead of bundling Chromium — this is the single biggest RAM win vs. Electron (expect low-hundreds-of-MB idle vs. GitHub Desktop's ~800MB-1GB+ with helpers).
- **Backend (Rust):** all git operations, filesystem watching, and repo state live here. Never do git work in the frontend.
  - `git2` (libgit2 bindings) for status, diff, staging, commit, branch, log.
  - Shell out to system `git` specifically for `fetch`/`pull`/`push` — this defers to the user's real git config, SSH agent, and credential helper without reimplementing auth. libgit2 auth callbacks are a common source of subtle bugs; don't fight them, just exec `git`.
  - `notify` crate for filesystem watching (live-update the Changes view without polling).
- **Frontend:** React + TypeScript + Tailwind + shadcn/ui components. Communicate with the Rust backend via Tauri commands/events, never direct fs/git access from JS.
- **State management:** keep it minimal — Zustand or plain React context. Avoid Redux-scale ceremony for an app this size.

## Performance Requirements (non-negotiable)

These are the actual reason this project exists — treat them as acceptance criteria, not aspirations:

1. **Idle RAM target: under 150MB** for the main process + webview combined, with a repo open and no active operations.
2. **Cold start to interactive: under 1 second** on typical hardware.
3. **No polling.** Repo state changes must be driven by filesystem events (`notify` crate) pushed to the frontend, not timers.
4. **Virtualize all lists.** File lists in Changes/diff view and commit History must use a virtualized list (e.g. `@tanstack/react-virtual`) — GitHub Desktop chokes on monorepos with thousands of tracked files; don't repeat that mistake.
5. **Debounce fs-watch events** (e.g. 100-200ms) before recomputing git status — large repos fire bursts of fs events on checkout/build.
6. **Diffs computed in Rust**, not shipped as raw file contents to JS for client-side diffing. Only send the frontend the structured diff (hunks/lines), not full file blobs, unless the file is opened for full view.
7. Avoid re-render storms: memoize diff/list rendering, no unnecessary re-fetch of full repo status on every keystroke (e.g. commit message typing must not trigger a git status re-scan).

## Feature Scope

- Current repository selector (dropdown)
- Current branch selector (dropdown) — switch/create branch
- Fetch/Sync button with last-fetched timestamp; shows ahead/behind counts once implemented

- List of added repositories, grouped by owner/account (group key is whatever git remote/owner metadata is available, not a GitHub-account concept)
- Each row: repo icon, name, indicator dot for uncommitted changes, lock icon for private/local-only repos (however you choose to define "private" — this app has no GitHub API, so treat it as a user-set flag or infer from remote visibility only if trivially available; don't build API calls just for this icon)
- "Add" dropdown: Clone Repository (via URL), Create New Repository (git init), Add Existing Repository (pick local folder)
- Filter/search input to filter the repo list

- File list with checkboxes for stage/unstage (per-file and select-all)
- Filter input for file list
- Selecting a file shows its diff in an adjacent pane (line-by-line, additions/deletions highlighted, monospace)
- Commit summary (required, single line) + description (optional, multi-line) inputs
- "Commit to {branch}" primary action button, disabled when summary is empty or nothing staged
- Empty state ("No local changes") — keep it simple; a plain centered message is fine

- Commit log list (virtualized), each row: author avatar/initial, summary, relative timestamp, short hash
- Selecting a commit shows its diff (same diff component reused from Changes tab)

- Line-by-line unified diff, syntax-aware highlighting is a nice-to-have, not a blocker for v1
- Handle binary files and images with a "binary file changed" placeholder — don't attempt image diffing in v1


- Pull request creation/review/merge
- Multi-account GitHub auth
- Stash management UI

- Inline diff review comments
- Image/binary diffing

## Suggested Build Order

1. Tauri scaffold + shadcn/ui theme setup (no GitHub colors — pick a neutral palette, dark mode first-class)
2. Rust backend: open repo, `git status` via git2, expose as Tauri command
3. Changes tab: file list + staging, wired to real repo
4. Diff pane for a selected file
5. Commit flow (summary/description → `git2` commit)
6. Branch dropdown: list + checkout via git2
7. History tab: commit log via git2, reuse diff pane for commit diffs
8. Repo sidebar: add/remove repos, persist list (local config file, e.g. `~/.config/gitbud/repos.json`)
9. Fetch/push/pull: shell out to system `git`, stream stdout/stderr back to a small status toast/log
10. Filesystem watcher wired into Changes tab for live updates (replace any manual refresh)
11. Performance pass: profile idle RAM, verify virtualization kicks in on a large repo, verify no polling loops

## Working Notes for the Implementing LLM

- When in doubt between "more features" and "less RAM," choose less RAM. That is the entire point of this project.
- Prefer shelling out to system `git` over reimplementing anything auth-related in Rust. Do not write any OAuth, token storage, or credential UI.
- Keep the frontend a thin rendering layer. All git truth lives in Rust; the frontend should be able to be thrown away and rebuilt without touching git logic.
