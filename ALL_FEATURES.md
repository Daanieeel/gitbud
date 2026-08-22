# GitBud — Feature Status

Exhaustive list of implemented, partial, and not-started features. Status legend:
**Done** — fully working · **Partial** — works but with a noted gap or scope limit · **Not started**.

## Core git operations

| Feature | Status | Notes |
|---|---|---|
| Status / working-tree diff | Done | `repo.rs`, `diff.rs` |
| Stage/unstage whole file | Done | |
| Hunk-level stage/unstage/discard | Partial | Hunk granularity, not individual lines (`hunk.rs`) |
| Discard file/hunk | Done | |
| Commit (+ amend) | Done | `CommitBox.tsx`; amend pre-fills last message |
| Commit message history | Done | localStorage, per-machine not per-repo (`lib/commit-history.ts`) |
| Pre-filled commit message for single-file commits | Done | Summary only, when field is empty |
| Protected branch guard | Done | Warning in `CommitBox.tsx` + icon in `BranchSwitcher.tsx` for main/master |
| Branch list/create/checkout/delete | Done | |
| Branch rename | Done | Works on the checked-out branch too (fixed this session) |
| Merge branch | Done | |
| Cherry-pick / revert | Done | From commit context menu |
| Interactive rebase | Partial | Reorder/squash/drop via cherry-pick sequence with full rollback on conflict — not real resumable `git rebase -i`; no "edit" stop-to-amend action |
| Merge conflict resolution | Done | Real base/mine/theirs 3-way view with per-block picks (this session), raw-marker view as fallback, plus whole-file Use Mine/Theirs |
| Stash (save/apply/pop/drop) | Done | |
| Stash management panel | Done | Dedicated dialog, per-file diff preview, per-file partial-apply (this session) |
| Tags (create/delete/push) | Done | `TagsPanel.tsx` |
| Fetch/pull/push | Done | Streaming progress, idle-timeout watchdog, cancel button, surfaced errors (fixed this session) |
| Pull strategy (merge/rebase/ff-only) | Done | Settings |
| Clone | Done | Including "clone from GitHub" repo browser |
| Reflog / undo | Done | Toolbar panel, 1-click restore-to-here (this session) |
| Git worktrees | Done | List/create/remove, guided UX for first-time users (this session) |
| Submodules | Done | List/init/update, per-submodule + update-all |
| Git LFS awareness | Done | Detection, file-list badges, pull/push (this session) |
| Blame | Done | Full-file view, click to jump to History |
| Commit signature verification | Done | "Verified" badges via GitHub API |
| Commit graph | Partial | Lane assignment + tags shown; branch labels only for current branch |

## GitHub integration

| Feature | Status | Notes |
|---|---|---|
| Sign in (device flow / `gh` CLI) | Done | |
| Multiple GitHub accounts | Done | |
| Non-GitHub identities (SSH key) | Done | This session — unified switcher, per-repo or global scope |
| GitHub Enterprise Server | Done | Configurable host |
| GitLab / Bitbucket providers | Not started | Switcher architecture leaves room for it |
| Pull Requests tab + list/filter/search | Done | |
| PR detail + checkout + merge (3 strategies) | Done | |
| Create PR | Partial | No commit/diff preview before submit; not reachable from Toolbar/BranchSwitcher |
| CI/Actions status badges | Done | |
| Watched-PR CI notifications | Done | This session |
| Fork sync / upstream tracking | Done | |
| "Open on GitHub" deep-links + permalinks | Done | |
| Merged-branch pruner | Done | |

## UI / UX

| Feature | Status | Notes |
|---|---|---|
| Icons across actions | Done | Audited this session |
| Settings dialog | Done | All sections wired to real effect |
| Settings import/export | Done | This session |
| Command palette (`Cmd+P`/`Cmd+K`) | Done | Substring search, not fuzzy-scored |
| Keyboard shortcuts | Partial | Commit/pull/repo-switch only; no list arrow-key navigation |
| Context menus (repo/branch/file/commit) | Done | |
| Diff view (unified/split, syntax highlight) | Done | Split is structural pairing, not full LCS alignment |
| Image/binary diff viewer | Done | |
| File icons | Partial | Lightweight custom mapping, not the vendored vscode-symbols asset pack |
| Sidebar: sort (name/recent/group/manual) | Done | Manual drag-to-reorder added this session |
| Sidebar: custom sections | Done | Per-repo override of auto-derived group |
| Sidebar: ahead/behind badges | Done | |
| Sidebar: animated sync status | Done | |
| Repo workspaces (named saved groups) | Done | This session |
| Multi-repo batch fetch/pull | Done | This session |
| Drag-and-drop folder to add repo | Done | |
| Desktop notifications | Done | This session — sync completion + watched PR CI |
| Default window size | Done | Tuned this session (doubled, then reduced ~25%) |
| App icon | Done | Redesigned this session (fox/git-motif) |
| Layout / information-architecture redesign | **Not started** | Still ad hoc placement; needs a dedicated design pass |
| Auto-update | Partial | Mechanism fully wired this session; needs a real signed-release endpoint to activate |

## P3 / exploratory

| Feature | Status | Notes |
|---|---|---|
| GPG/SSH commit-signing setup wizard | Not started | |
| Localization / i18n framework | Not started | |
| Plugin/extension hook points | Not started | |
| Offline-mode indicator | Not started | |

## Platform

| Feature | Status | Notes |
|---|---|---|
| macOS | Done | Primary target |
| Windows | Partial | Cross-platform code paths exist (kill/taskkill, path handling) but untested on this session's sandbox (macOS only) |
| Linux | Not started | Untested |
