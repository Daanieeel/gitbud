# GitBud — Feature Status

Exhaustive list of implemented, partial, and not-started features. Status legend:
**Done** — fully working · **Partial** — works but with a noted gap or scope limit · **Not started**.

## Core git operations

| Feature | Status | Notes |
|---|---|---|
| Status / working-tree diff | Done | `repo.rs`, `diff.rs` |
| Stage/unstage whole file | Done | |
| Hunk-level stage/unstage/discard | Done | `hunk.rs` |
| Line-level stage/unstage/discard | Done | This session — per-line action alongside existing chunk staging; a modified line is a delete+add pair under the hood, so replacing it cleanly means selecting both |
| Discard file/hunk/line | Done | Single-file discard confirmation is a dialog now (was a Popover that flashed and closed immediately when opened from the same row's context menu) |
| "Add to .gitignore" file action | Done | This session — single-file and multi-file selection context menu |
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
| Interactive rebase | Partial | Reorder/pick/squash/fixup/drop via cherry-pick sequence with full rollback on conflict — not real resumable `git rebase -i`; no "edit" stop-to-amend action |
| Fixup commit + autosquash | Done | This session — "Create Fixup Commit" in the commit context menu (`fixup! <target>`, discards its own message on rebase); interactive rebase dialog auto-arranges fixup!/squash! commits next to their target, toggleable |
| Merge conflict resolution | Done | Real base/mine/theirs 3-way view with per-block picks (this session), raw-marker view as fallback, plus whole-file Use Mine/Theirs |
| Stash (save/apply/pop/drop) | Done | |
| Stash management panel | Done | Dedicated dialog, per-file diff preview, per-file partial-apply (this session) |
| Tags (create/delete/push) | Done | `TagsPanel.tsx` |
| Fetch/pull/push | Done | Streaming progress, idle-timeout watchdog, cancel button; failures show a cleaned-up error (transport noise/boilerplate stripped) instead of the raw exit status (this session) |
| Background remote sync | Done | This session — silent `git fetch` (remote-tracking refs only, never touches the working tree) keeps ahead/behind and the remote branch list current without a manual fetch; paused while the window isn't visible, with an immediate catch-up on refocus/repo switch |
| Diverged-branch sync | Done | This session — toolbar button pulls then pushes in one action when both ahead and behind; if the pull conflicts with a local commit it aborts the merge/rebase immediately and never pushes, suggesting a manual undo-commit/stash/pull/unstash/recommit path instead. A `--ff-only` pull that fails with git's own "diverging branches" error now opens a resolve dialog (merge or rebase, one-off override of the configured strategy) instead of a dead-end error toast |
| Pull strategy (merge/rebase/ff-only) | Done | Settings |
| Diff algorithm setting | Partial | This session — Myers/Minimal/Patience, applied everywhere a diff is built; Histogram not offered since libgit2 (which every diff goes through) doesn't implement it |
| Clone | Done | Including "clone from GitHub" repo browser |
| Reflog / undo | Done | Toolbar panel, 1-click restore-to-here (this session) |
| Git worktrees | Done | List/create/remove, guided UX for first-time users (this session) |
| Submodules | Done | List/init/update, per-submodule + update-all |
| Git LFS awareness | Done | Detection, file-list badges, pull/push (this session) |
| Blame | Done | Full-file view, click to jump to History |
| Commit signature verification | Done | "Verified" badges via GitHub API |
| Commit graph | Partial | Lane assignment + tags shown; branch labels only for current branch. Compact mode (this session) collapses merged-in branches to a bump at the merge commit instead of their own lane; unpushed commits render as a hollow dot |
| Commit detail header | Done | This session — summary/description, authors (incl. `Co-authored-by:` trailers, hoverable avatars), date, copiable hash, diffstat, tags — above the History tab's file explorer |

## GitHub integration

| Feature | Status | Notes |
|---|---|---|
| Sign in (device flow / `gh` CLI) | Done | |
| Multiple GitHub accounts | Done | |
| Non-GitHub identities (SSH key) | Done | This session — unified switcher, per-repo or global scope |
| GitHub Enterprise Server | Done | Configurable host |
| GitLab / Bitbucket providers | Not started | Switcher architecture leaves room for it |
| Pull Requests tab + list/filter/search | Done | State-colored, state-specific icons per PR (open/draft/merged/closed) (this session); the open-PR list also refreshes in the background (see Background remote sync) so new/updated PRs surface without reopening the tab |
| PR detail + checkout + merge (3 strategies) | Done | Dedicated merge dialog: method picker (cards, disabled+tooltip'd for methods the repo, classic branch protection, *or* repository rulesets' `allowed_merge_methods` disallow), pre-filled commit title, live per-check CI status as clickable links to the job run, editable target branch (this session — retargets the PR via a PATCH before merging), delete-branch-after-merge (remote + local; local delete now correctly handles the checked-out-branch case by checking out the base first, fixed this session), pinned to the PR's head sha to avoid merging unseen commits; allowed-methods settings prefetched as soon as the PR tab loads. File explorer is horizontally resizable (this session) |
| Create PR | Partial | No commit/diff preview before submit; not reachable from Toolbar/BranchSwitcher |
| Quick access to current branch's PR | Done | Toolbar button shows "Preview PR" (none exists yet, disabled with a reason when there's no commit or no other branch to open into — this session) or "View PR" (jumps to it in the PR tab) depending on whether the current branch already has an open PR |
| GitHub avatars | Partial | PR authors and review comments show the real GitHub avatar; History tab commit authors resolved by email (GitHub noreply addresses decoded directly, other emails via best-effort user search) so not every commit resolves one; GitLab/Bitbucket not started |
| CI/Actions status badges | Done | |
| Fork sync / upstream tracking | Done | |
| "Open on GitHub" deep-links + permalinks | Done | |
| Merged-branch pruner | Done | |

## UI / UX

| Feature | Status | Notes |
|---|---|---|
| Icons across actions | Done | Audited this session |
| Settings dialog | Done | All sections wired to real effect |
| Settings import/export | Done | This session |
| Command palette (`Cmd+P`/`Cmd+K`) | Done | Fuzzy scored match (this session — "go to anything" style: subsequence match, weighted for consecutive runs and word/path/camelCase boundaries), all kinds ranked together |
| Keyboard shortcuts | Partial | Commit/pull/repo-switch, plus arrow-key navigation for commit, PR, and branch lists (this session — branch switcher uses highlight+Enter since checkout is a real action, not instant-select) |
| Context menus (repo/branch/file/commit) | Done | |
| Diff view (unified/split, syntax highlight) | Done | Split is structural pairing, not full LCS alignment; replace-style add/delete line pairs get char-level intraline highlighting (only the changed substring, not the whole line), falling back to a whole-line change past ~15 changed characters (this session) — across every diff source — working tree, commit, branch compare, PR files, conflict resolution |
| Image/binary diff viewer | Done | |
| File icons | Done | Uses `@react-symbols/icons` (the actual VSCode "Symbols" icon pack) |
| File status icons | Done | This session — unified created/modified/deleted/moved icon (was an ambiguous color dot) with an explanatory tooltip, shared across every file explorer (changes, stash, history, PR files, branch-diff preview) |
| Sidebar: sort (name/recent/group/manual) | Done | Manual drag-to-reorder added this session |
| Sidebar: custom sections | Done | Per-repo override of auto-derived group |
| Sidebar: ahead/behind badges | Done | |
| Sidebar: animated sync status | Done | |
| Repo workspaces (named saved groups) | Done | This session |
| Multi-repo batch fetch/pull | Done | This session |
| Drag-and-drop folder to add repo | Done | |
| Desktop notifications | Done | Long-running sync completion |
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
| Windows | Partial | Cross-platform code paths exist (kill/taskkill, path handling); release CI builds and runs the Rust test suite on `windows-latest` (caught a real CRLF-related test failure this session), but no manual UI verification (this session's sandbox is macOS only) |
| Linux | Not started | Untested |
