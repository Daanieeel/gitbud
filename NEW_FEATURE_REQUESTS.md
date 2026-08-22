# New Feature Requests

Ordered by priority (highest impact / biggest current gap first).
Mark as done when the feature is implemented.

## P-1 — GitHub functionality

- [x] **Interactive GitHub Login** - Device Flow (industry-standard for public/secretless desktop apps) plus one-click zero-config sign-in via detected `gh` CLI login. Note: a fully click-only OAuth flow with no client ID at all would require Anthropic/GitBud hosting a token-exchange backend, which doesn't exist for this OSS project — the `gh` CLI path covers that for anyone who has it.
- [x] **Pull Requests tab & 1-click local checkout** — `PRTab.tsx`/`PRList.tsx`/`PRDetail.tsx`. Open/closed/all filter, search by title/author/#, labels, CI badges. "Checkout" fetches `pull/{n}/head` into a local `pr-{n}` branch (`git_shell::checkout_pull_request`).
- [x] **Create Pull Request workflow** — `CreatePRDialog.tsx`, reachable from the PR tab. Base/compare selection, `.github/PULL_REQUEST_TEMPLATE.md` auto-load, draft toggle. (Not yet reachable from Toolbar/BranchSwitcher specifically, and no commit/diff preview before submit.)
- [x] **CI / GitHub Actions status indicators & check details** — `CIBadge.tsx`, used in PR rows/detail and `CommitList.tsx`. Popover lists check runs with deep-links.
- [x] **"Clone from GitHub" repository browser** — `CloneDialog.tsx` lists the signed-in user's repos (owner/collaborator/org) with search, click to fill the URL.
- [x] **Fork sync & upstream tracking** — `UpstreamBanner.tsx` + `git_shell::sync_upstream`/`get_upstream_ahead_behind`.
- [x] **"Open on GitHub" deep-links & permalinks** — context menus on commits (`CommitList.tsx`), branches (`BranchSwitcher.tsx`), files (`FileList.tsx`); per-line "Copy GitHub Permalink" in `DiffView.tsx` (wired in History tab).
- [x] **Zero-config GitHub CLI (`gh`) auth detection** — `github::auth::detect_gh_cli`, offered first in `SignInDialog.tsx`.
- [x] **Merged branch pruner & remote cleanup** — `BranchPruner.tsx` in the sidebar footer; cross-references local branches against merged/closed PRs, 1-click delete (local + prunes stale remote-tracking refs via `fetch --prune`).
- [x] **Protected branch guard / commit warning** — inline warning in `CommitBox.tsx` + indicator icon in `BranchSwitcher.tsx` for `main`/`master`.
- [x] **Commit signature verification (`Verified` badges)** — `VerificationBadge` in `CommitList.tsx`, via `github_get_commit_verification`.
- [x] **GitHub Enterprise Server (GHES) support** — configurable host (`github::auth::get_host/set_host`, threaded through every API call and web link); settings UI still pending (see Settings view below).

## P0 — Core gaps

- [x] **Hunk / line-level staging** — `hunk.rs` (`stage_hunk`/`unstage_hunk`/`discard_hunk`, patch-construction + `git2::Repository::apply`), buttons in `DiffView.tsx` hunk headers when viewing the Changes tab. Verified with real conflicting-hunk tests. (Line-level, not just hunk-level, is still open — hunk is the granularity implemented.)
- [x] **Merge conflict resolution UI** — `ConflictResolutionPanel.tsx` swaps in for conflicted files in `ChangesTab.tsx` (distinct destructive-red badge in `FileList.tsx` too): "Use Mine"/"Use Theirs" (`repo::resolve_conflict`), "Edit Manually" (opens in default editor), "Mark Resolved" (stages). Raw conflict-marker preview shown; not a rendered 3-way diff.
- [x] **Real settings view (modal/popup)** — `SettingsDialog.tsx`, gear icon in `Toolbar.tsx`, backed by `settings.rs` (`~/.config/gitbud/settings.json`). All sections wired to real effect: theme (live class toggle), git identity (global/per-repo via `settings::set_git_identity`), default branch name (used by `init_repo`), pull strategy (`--rebase`/`--ff-only` flags on `git pull`), diff ignore-whitespace + font size, sidebar ahead/behind toggle + sort order, git binary path override (`settings::git_binary()`), fs-watch on/off gate in `start_watch`. GitHub host (GHES) also lives here.
- [x] **Commit graph visualization** — lane-assignment algorithm in `history.rs` (`assign_lanes`), returned from `get_log`, rendered as an SVG column in `CommitGraph.tsx`/`CommitList.tsx`. Tag labels shown too (via `TagsPanel`'s data); branch labels at specific commits are not (only the current branch shows, in the toolbar).
- [x] **Discard changes per-file/per-hunk** — `repo::discard_file` (context menu) and `hunk::discard_hunk` ("Discard Hunk" button in `DiffView.tsx`).
- [x] files need file icons. `lib/file-icons.ts` maps extensions to a colored lucide icon (git status shown as a small corner dot instead of recoloring the whole icon). Note: this is an original lightweight mapping, not the actual vendored vscode-symbols SVG asset pack (couldn't pull ~hundreds of external SVGs into this sandboxed build) — visually similar intent, different source.
- [x] code syntax highlighting. `lib/highlight.ts` (highlight.js core + curated language set), colors mapped from `.reference/color-pallette.json`'s tokenColors in `index.css`. Diff lines no longer tint the whole line background — only the leading +/- glyph is colored green/pink now.
- [x] create an open-source ready short REAMDE for this project — `README.md` rewritten with a pitch intro, feature list, perf targets, getting-started, architecture, and contributing sections.

## P1 — High-value quality of life

- [x] **Command palette (`Cmd+P`)** — `CommandPalette.tsx`: substring search (not fuzzy-scored) over repos, local branches, currently-changed files, and full commit history (`history::search_commits`, not limited to what's paginated in). `Cmd+K` opens the same palette scoped to just repos.
- [x] **General keyboard shortcuts** — `Cmd+Enter` to commit (`CommitBox.tsx`), `Cmd+Shift+P` to pull, `Cmd+K` to switch repos (global listener in `App.tsx`). Arrow-key navigation through file/commit lists not implemented.
- [x] **Right-click context menus** — repos (`RepoSidebar.tsx`): Open in Terminal/Finder, Copy Path, Remove from Sidebar. Files (`FileList.tsx`): Copy Path, Reveal in Finder, Open in Terminal, View on GitHub, Discard Changes. Commits (`CommitList.tsx`): Copy SHA, Open on GitHub, Cherry-pick, Revert, Create Branch Here. Branches (`BranchSwitcher.tsx`): Copy Name, Open on GitHub, Rename, Merge into Current, Delete.
- [x] **Amend last commit** — checkbox in `CommitBox.tsx`, pre-fills the last commit's message.
- [x] **Ahead/behind badges** in the sidebar (`RepoSidebar.tsx`), toggleable in Settings.
- [x] **Cherry-pick & revert** — `repo::cherry_pick`/`repo::revert_commit`, from the commit context menu.
- [x] **Inline blame view** — `blame::blame_file` + "Blame File" in the file context menu opens `BlameDialog.tsx` (full file + per-line author/commit gutter, click to jump to History). Not a gutter toggle inside `DiffView.tsx` itself — there's no full-file view in the diff pane to toggle within.
- [x] **Tag management** — `TagsPanel.tsx` in the toolbar: create (lightweight or annotated), delete, push to origin; tag labels shown next to commits in `CommitList.tsx`.
- [x] pre-filled commit message (summary, not description) for single-file commits — `CommitBox.tsx`, "Update {filename}", only when the summary field is empty.
- [x] commit message + description inputs must stay filled out — lifted to `useRepoStore` (`commitSummary`/`commitDescription`) instead of `CommitBox` local state, so switching Changes/History/PRs tabs (which unmounts `CommitBox`) no longer loses the draft.
- [~] tooltips on buttons — added to the highest-traffic ones (sync, tabs, commit/amend, stage-all/stage-file checkboxes, branch switcher, stash, PR checkout/merge/create). Not literally every button in the app yet.

## P2 — Nice to have

- [x] **Diff view toggles** — split (side-by-side, structural pairing not full LCS alignment) vs. unified, quick toggle button in `DiffView.tsx` plus the Settings dropdown; ignore-whitespace already in Settings → Diff. Word-wrap not implemented (diffs stay horizontally scrollable, matching most git tools' default).
- [x] **File search/filter** in `ChangesTab.tsx`/`FileList.tsx` — already existed since the initial build (filter input above the file list).
- [x] **Interactive rebase** — `rebase.rs` + `InteractiveRebaseDialog.tsx`. Reorder (native HTML5 drag-and-drop, no new dependency), squash, drop. Deliberately *not* real `git rebase -i`: built on the same cherry-pick primitive as the commit context menu, and any conflict does a full rollback to the original HEAD rather than pausing in a resumable half-applied state — every outcome is either "applied cleanly" or "nothing changed." No "edit" action (stop to amend a commit's content mid-sequence).
- [x] **Custom sidebar sections** — `RepoEntry.section` (per-repo override of the auto-derived owner group), set via "Move to Section…" in the repo context menu (a `window.prompt()`, not a full drag-and-drop UI); only takes effect when sidebar sort is "group".
- [x] **Commit message history** — `lib/commit-history.ts` (localStorage, per-machine not per-repo), history icon next to the summary field in `CommitBox.tsx`. Loading a repo's `.gitmessage` template is not implemented.
- [x] **Drag-and-drop** a folder to add it as a repo (`RepoSidebar.tsx`, via Tauri's window-level `onDragDropEvent` — the drop target is the whole window, not hit-tested to the sidebar's DOM bounds specifically, but the sidebar highlights during drag as the visual target).
- [x] **Submodule support** — `submodules.rs` (list via git2) + `SubmodulesPanel.tsx` (toolbar, only shown when the repo has any); init/update per-submodule or all at once, shelled out to system `git submodule update --init` (same auth reasoning as fetch/pull/push).
- [x] **Animated status icons** — spinning refresh icon on the active repo's sidebar row while fetch/pull/push is running (`RepoSidebar.tsx`).
