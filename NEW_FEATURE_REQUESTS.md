# New Feature Requests

Ordered by priority (highest impact / biggest current gap first).
Mark as done when the feature is implemented.

## P-1 — GitHub functionality

- [ ] **Interactive GitHub Login** - instead of entering a client id manually, use the GitHub login flow to authenticate with GitHub.
- [ ] **Pull Requests tab & 1-click local checkout** — Dedicated "Pull Requests" tab in `TabBar.tsx` to browse open, closed, and merged PRs for the current repository. Includes search/filter by author, review status, and labels, plus status badges (Draft, CI passing/failing, Approved). Double-click or click "Checkout PR" to automatically fetch (`refs/pull/{id}/head` for forks/branches) and switch to a local tracking branch to test changes locally.
- [ ] **Create Pull Request workflow** — Quick "Create Pull Request" trigger from `Toolbar.tsx` or `BranchSwitcher.tsx` when the active branch is ahead of the upstream default branch. Modal includes base/compare branch selection, auto-loading `.github/PULL_REQUEST_TEMPLATE.md` (or recent commit messages) into the description editor, draft PR toggle, and preview of commits/diff before submission.
- [ ] **CI / GitHub Actions status indicators & check details** — Build check status badges (passed, failed, pending) rendered directly on commit rows in `HistoryTab.tsx` / `CommitList.tsx` and in the PR view. Popover/tooltip showing individual check run names, durations, and direct deep-links to failing GitHub Action workflow runs.
- [ ] **"Clone from GitHub" repository browser** — Expand `CloneDialog.tsx` to list the authenticated user's repositories, organization repos, and starred projects with a live search/filter, eliminating the need to manually copy-paste clone URLs.
- [ ] **Fork sync & upstream tracking** — Automatic detection of fork remotes; surface an "Upstream is X commits ahead" status banner with a 1-click "Fetch Upstream & Fast-Forward" button to keep forks up-to-date without terminal commands.
- [ ] **"Open on GitHub" deep-links & permalinks** — Context menu actions on commits, branches, files, and diff line gutters: "Open Commit on GitHub", "View File at this Revision", "Copy GitHub Permalink to Line", and "Open Repository in Browser".
- [ ] **Zero-config GitHub CLI (`gh`) auth detection** — Automatically detect existing authentication from the local GitHub CLI (`gh auth token` or `~/.config/gh/hosts.yml`) so developers using `gh` are logged in immediately without manual token generation.
- [ ] **Merged branch pruner & remote cleanup** — Surface branches whose associated PRs have been merged on GitHub with a 1-click "Prune Merged Branches" action to safely delete local and remote-tracking branches.
- [ ] **Protected branch guard / commit warning** — Visual indicator and safety prompt when uncommitted changes or new commits are being made directly on protected default branches (e.g. `main`/`master`) instead of a feature branch.
- [ ] **Commit signature verification (`Verified` badges)** — Surface GPG / SSH / S-MIME signature verification status badges next to commit authors in `HistoryTab.tsx` as verified by GitHub.
- [ ] **GitHub Enterprise Server (GHES) support** — Configurable custom GitHub domain/host endpoint for enterprise on-premise deployments.

## P0 — Core gaps

- [ ] **Hunk / line-level staging** — stage/unstage individual hunks or lines from `DiffView.tsx`, not just whole files. Needs `stage_hunk`/`unstage_hunk` Tauri commands (patch + `git apply --cached`). Table-stakes vs GitHub Desktop, Fork, Tower.
- [ ] **Merge conflict resolution UI** — surface conflicted files distinctly in `ChangesTab.tsx` (conflict badge, not just "modified"), with a 3-way view ("Use Mine" / "Use Theirs" / "Edit Manually") and "Mark Resolved" to stage. Biggest current gap vs. Fork/SourceTree.
- [ ] **Real settings view (modal/popup)** — no settings surface exists today (only ad-hoc dialogs like `CloneDialog.tsx`). Gear icon in `Toolbar.tsx` opening a settings modal (built on existing `dialog.tsx` primitive), sectioned into:
  - [ ] **General** — theme (light/dark/system), accent color, default clone directory.
  - [ ] **Git** — user name/email (global vs. per-repo override via `config.rs`), default branch name, pull strategy (merge/rebase/ff-only).
  - [ ] **Diff** — default view (split/unified), whitespace handling, font size/family.
  - [ ] **Sidebar** — toggle ahead/behind badges, default repo sort order.
  - [ ] **Advanced** — git binary path override, fs-watch on/off (ties into `watch.rs`).
  - [ ] Persist to a config file via `config.rs` so settings survive restarts.
- [ ] **Commit graph visualization** — branch/merge graph column (like `git log --graph`) with lane layout and branch/tag labels, computed server-side in `history.rs` and returned from `get_log`.
- [ ] **Discard changes per-file/per-hunk** — scoped "discard" action next to stage/unstage, not all-or-nothing.
- [ ] files need file icons. use the ones from https://github.com/miguelsolorio/vscode-symbols for a very minimalistic, yet effective icon set that reacts to file/folder names
- [ ] code syntax highlighting. Show syntax highlighting for code files, using the same colors as VS Code. only color the plus and minus signs in diff views in the red and green (or yellow and blue)
- [ ] create an open-source ready short REAMDE for this project that explains how to get started, what features are available, and how to contribute. it should have a short introduction that is a bit of a "marketingy" pitch for the project.

## P1 — High-value quality of life

- [ ] **Command palette (`Cmd+P`)** — fuzzy-search branches, commits (message/hash/author), and files in the current repo, jump straight to the relevant tab/view. Extend to jump between repos too, via `RepoSidebar.tsx`.
- [ ] **General keyboard shortcuts** — `Cmd+Enter` to commit, `Cmd+Shift+P` to pull, `Cmd+K` to switch repos, arrow-key navigation through file/commit lists.
- [ ] **Right-click context menus** on different elements in the app (decide what makes sense where): "Open in Terminal", "Open in Finder", "Copy Path", "Remove from Sidebar". Files: "Copy Path", "Open in Terminal", "Reveal in Finder". Commits: "Copy SHA", "Cherry-pick", "Revert", "Create branch here". Branches: "Copy Name", "Rename", "Delete", "Merge into current".
- [ ] **Amend last commit** — checkbox/toggle in `CommitBox.tsx` to amend instead of creating a new commit.
- [ ] **Ahead/behind badges** in the sidebar per repo, so sync state is visible without opening it.
- [ ] **Cherry-pick & revert** — pick a commit from history and apply it to the current branch, or revert it, without a terminal.
- [ ] **Inline blame view** — `git_blame(path)` command + gutter toggle in the diff/file view; click a blamed line to jump to that commit in `HistoryTab`.
- [ ] **Tag management** — create, push, and delete tags from the UI; show tags alongside branch labels in history.
- [ ] pre-filled commit message (summary, not description) for single-file commits
- [ ] commit message + description inputs must stay filled out even when files are added/removed/changed; currently resets when tabbing away, changing files and tabbing back
- [ ] tooltips on all buttons in the UI to explain what they do (optionally showing a shortcut)

## P2 — Nice to have

- [ ] **Diff view toggles** — split vs. unified view, ignore-whitespace, word-wrap.
- [ ] **File search/filter** in `ChangesTab.tsx`/`FileList.tsx` for repos with large changesets.
- [ ] **Interactive rebase** — reorder/squash/edit/drop commits via a drag-orderable list before running `git rebase -i`.
- [ ] **Custom sidebar sections** (Favorites, Work, Personal, etc.) to organize repositories instead of one flat list.
- [ ] **Commit message templates / history** — recall recently used commit messages, or load a repo's `.gitmessage` template.
- [ ] **Drag-and-drop** a folder onto the sidebar to add it as a repo (alternative to `AddRepoMenu.tsx`'s picker).
- [ ] **Submodule support** — detect and show submodule status, allow update/init from the UI.
- [ ] **Animated status icons** — subtle spinner/pulse on a repo row while fetch/pull/push is running.
