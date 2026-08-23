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
| Multi-select in Changes file explorer | Done | This session — shift-click range select, cmd/ctrl-click toggle, batch stage/unstage/discard/copy-paths via a distinct context menu when multiple files are selected |
| Commit (+ amend) | Done | `CommitBox.tsx`; amend pre-fills last message; summary/description inputs have autocomplete off |
| Commit message history | Done | localStorage, per-machine not per-repo (`lib/commit-history.ts`) |
| Pre-filled commit message for single-file commits | Done | Summary only, when field is empty |
| Undo last commit | Done | This session — soft-reset button below Commit for any unpushed commit; pre-fills the form with the undone message so repeated clicks walk back the whole unpushed chain |
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
| Fetch/pull/push | Done | Streaming progress, idle-timeout watchdog, cancel button; failures show a cleaned-up error (transport noise/boilerplate stripped) instead of the raw exit status (this session) |
| Background remote sync | Done | This session — silent `git fetch` (remote-tracking refs only, never touches the working tree) keeps ahead/behind and the remote branch list current without a manual fetch; paused while the window isn't visible, with an immediate catch-up on refocus/repo switch |
| Diverged-branch sync | Done | This session — toolbar button pulls then pushes in one action when both ahead and behind; if the pull conflicts with a local commit it aborts the merge/rebase immediately and never pushes, suggesting a manual undo-commit/stash/pull/unstash/recommit path instead |
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
| Pull Requests tab + list/filter/search | Done | State-colored, state-specific icons per PR (open/draft/merged/closed) (this session); the open-PR list also refreshes in the background (see Background remote sync) so new/updated PRs surface without reopening the tab |
| PR detail + checkout + merge (3 strategies) | Done | This session — dedicated merge dialog: method picker (cards, disabled+tooltip'd for methods the repo, classic branch protection, *or* repository rulesets' `allowed_merge_methods` disallow), pre-filled commit title, live per-check CI status as clickable links to the job run, delete-branch-after-merge (remote + local, best-effort), pinned to the PR's head sha to avoid merging unseen commits; allowed-methods settings prefetched as soon as the PR tab loads |
| Create PR | Partial | No commit/diff preview before submit; not reachable from Toolbar/BranchSwitcher |
| Quick access to current branch's PR | Done | This session — toolbar button shows "Preview PR" (none exists yet) or "View PR" (jumps to it in the PR tab) depending on whether the current branch already has an open PR |
| GitHub avatars | Partial | This session — PR authors and review comments show the real GitHub avatar; History tab commit authors resolved by email (GitHub noreply addresses decoded directly, other emails via best-effort user search) so not every commit resolves one; GitLab/Bitbucket not started |
| CI/Actions status badges | Done | |
| Watched-PR CI notifications | Done | This session — polling paused while the window isn't visible, decays from 5s down to 60s the longer the app's been open, catches up immediately on refocus/repo switch |
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
| Diff view (unified/split, syntax highlight) | Done | Split is structural pairing, not full LCS alignment; replace-style add/delete line pairs get char-level intraline highlighting (only the changed substring, not the whole line) across every diff source — working tree, commit, branch compare, PR files, conflict resolution (this session) |
| Image/binary diff viewer | Done | |
| File icons | Done | Uses `@react-symbols/icons` (the actual VSCode "Symbols" icon pack) |
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
