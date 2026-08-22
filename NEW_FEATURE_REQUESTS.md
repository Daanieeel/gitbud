# New Feature Requests

Ordered by priority (highest impact / biggest current gap first).
Mark as done when the feature is implemented.

## P0 — Critical bugs

- [x] **Push to origin hangs indefinitely** — root cause was a credential-prompt deadlock: git was spawned with an inherited stdin and no `GIT_TERMINAL_PROMPT=0`, so any HTTPS/SSH prompt (token, passphrase) had nowhere to go and blocked forever. Fixed in `git_shell.rs`: stdin is now `Stdio::null()`, `GIT_TERMINAL_PROMPT=0` is set, SSH runs with `BatchMode=yes`, and an idle-output watchdog now kills and errors out any streamed op (fetch/pull/push/clone/submodule update) after 45s of silence. Added a real Cancel button + surfaced error banner in `SyncLogToast.tsx` backed by a new `cancel_git_operation` command.
- [x] **"Rename Branch" incorrectly disabled on the checked-out branch** — removed the `disabled={b.is_head}` condition on the Rename item in `BranchSwitcher.tsx`; renaming the current branch now works like plain `git branch -m`.

## P0 — This batch

- [x] **More icons across actions** — audited context menus (repo/branch/file/commit), tab bar, toolbar/dialog buttons across the app and added consistent lucide icons to bare text-only actions (reusing the same icon per concept — copy, delete, rename, external-link, etc).
- [x] **Multi–git-account / multi-provider support** — `AccountBar.tsx` now shows a unified switcher over GitHub accounts *and* plain SSH-key-based identities (new `ssh_identity.rs` backend: host + key path, no hosted-provider API — stored in `~/.config/gitbud/ssh_identities.json`). Each identity can be set as the global default or pinned to just the currently-open repo (pin icon), persisted per-repo in `repos.json` (`identity_id`) and globally in `settings.json` (`default_identity_id`). Switching to an SSH identity wires its key into that repo via a local `core.sshCommand`; switching away clears it. Provider type is visually distinguished (avatar vs. key-icon badge + host). Room to add GitLab/Bitbucket OAuth providers later without changing the switcher shape.
- [x] **Default window size doubled** — default window is now 1600x1200 (was 800x600) in `tauri.conf.json`; still freely resizable.
- [x] **New app icon: pet + git motif** — replaced the icon set with a friendly fox/bear-cub mark (new `src-tauri/icons/source/app-icon.svg`) whose "ears" double as branch-tip commit nodes and whose chin has a tiny git merge-graph glyph; regenerated all bundle targets via `tauri icon`.

## P1 — Redesign (main priority once the above ships)

- [ ] **Layout redesign** — current UI works but reads as chaotic: buttons and panels feel placed ad hoc rather than grouped by purpose, making things hard to find (toolbar mixes repo actions/git actions/settings, sidebar mixes repo list/branch tools/pruner, dialogs vary in placement conventions). Needs a real information-architecture pass: group related actions, establish consistent panel regions (nav / primary content / contextual side panel / status bar), consistent spacing and hierarchy, and a clear visual system for where a given action "lives" so users build a mental map instead of hunting. Should be scoped as its own design pass (wireframe/mockup first) rather than incremental button-shuffling.

## P2 — Additional feature ideas

Ordered low-hanging-fruit first (smallest lift → biggest lift).

- [x] **Sidebar drag-to-reorder** — new "manual" sidebar sort mode (`Settings → Sidebar`); in that mode repo rows are HTML5-draggable and reordering persists via a new `set_repo_order` command that rewrites `repos.json`'s order.
- [x] **Settings import/export** — `Settings → Advanced → Settings backup`; new `export_settings`/`import_settings` commands write/read the same `Settings` JSON to/from an arbitrary file via a save/open dialog.
- [ ] **Desktop notifications** — optional OS notification when a long-running fetch/pull/push finishes, or when a watched PR's CI status changes.
- [ ] **Multi-repo batch actions** — "fetch all" / "pull all" across every sidebar repo at once, with a combined progress/status summary instead of repo-by-repo.
- [x] **Stash management panel** — clicking a stash now opens a dedicated dialog (`StashPanel.tsx`) with its file list and a real diff preview per file (reusing `DiffView`, backed by a new `get_stash_oid`/existing `get_commit_file_diff`), plus a per-file "restore from stash" partial-apply (new `stash_apply_file`, shells `git checkout stash@{n} -- <path>`) alongside the existing apply/pop/drop.
- [x] **Image / binary diff viewer** — already shipped (`ImageDiffView.tsx` + `image_diff.rs`), wired into `DiffView.tsx` for both the Changes and History tabs; checklist was stale.
- [ ] **Repo workspaces/groups** — user-defined groups of repos (beyond the auto-derived owner grouping) that can be opened together as a saved workspace.
- [ ] **Auto-update** — in-app update check/download for new GitBud releases instead of requiring a manual reinstall.
- [ ] **Git LFS awareness** — detect LFS-tracked files, show LFS status/size in the file list, surface `git lfs pull`/`push` progress instead of silently stalling on large binaries.
- [ ] **Reflog / undo UI** — a panel exposing `git reflog` with 1-click "restore to here," giving users a safety net for undoing resets, rebases, and accidental branch moves.
- [ ] **Visual 3-way merge tool** — upgrade the conflict resolution panel from raw-marker preview to a real base/mine/theirs 3-way diff view with per-block pick controls, not just whole-file "Use Mine"/"Use Theirs."
- [ ] **Git worktree support** — list, create, and remove worktrees for a repo; switch the active pane to a worktree without disturbing the main checkout. Make sure this worktree experience is REALLY intuitive and easily accessible to people who have never worked with worktrees before (explanative tooltips are a great help, for example).

## P3 — Later / exploratory

- [ ] GPG/SSH commit-signing setup wizard (generate or import a signing key, wire it into git config from within Settings).
- [ ] Localization / i18n framework for UI strings.
- [ ] Plugin/extension hook points for third-party panels or commands.
- [ ] Offline-mode indicator when network-dependent actions (fetch/push/PRs) can't reach the remote.
