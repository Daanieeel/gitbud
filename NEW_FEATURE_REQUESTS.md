# New Feature Requests

Ordered by priority (highest impact / biggest current gap first).

## P0 — Core gaps

- **Hunk / line-level staging** — stage/unstage individual hunks or lines from `DiffView.tsx`, not just whole files. Needs `stage_hunk`/`unstage_hunk` Tauri commands (patch + `git apply --cached`). Table-stakes vs GitHub Desktop, Fork, Tower.
- **Merge conflict resolution UI** — surface conflicted files distinctly in `ChangesTab.tsx` (conflict badge, not just "modified"), with a 3-way view ("Use Mine" / "Use Theirs" / "Edit Manually") and "Mark Resolved" to stage. Biggest current gap vs. Fork/SourceTree.
- **Real settings view (modal/popup)** — no settings surface exists today (only ad-hoc dialogs like `CloneDialog.tsx`). Gear icon in `Toolbar.tsx` opening a settings modal (built on existing `dialog.tsx` primitive), sectioned into:
  - **General** — theme (light/dark/system), accent color, default clone directory.
  - **Git** — user name/email (global vs. per-repo override via `config.rs`), default branch name, pull strategy (merge/rebase/ff-only).
  - **Diff** — default view (split/unified), whitespace handling, font size/family.
  - **Sidebar** — toggle ahead/behind badges, default repo sort order.
  - **Advanced** — git binary path override, fs-watch on/off (ties into `watch.rs`).
  - Persist to a config file via `config.rs` so settings survive restarts.
- **Commit graph visualization** — branch/merge graph column (like `git log --graph`) with lane layout and branch/tag labels, computed server-side in `history.rs` and returned from `get_log`.
- **Discard changes per-file/per-hunk** — scoped "discard" action next to stage/unstage, not all-or-nothing.

## P1 — High-value quality of life

- **Command palette (`Cmd+P`)** — fuzzy-search branches, commits (message/hash/author), and files in the current repo, jump straight to the relevant tab/view. Extend to jump between repos too, via `RepoSidebar.tsx`.
- **General keyboard shortcuts** — `Cmd+Enter` to commit, `Cmd+Shift+P` to pull, `Cmd+K` to switch repos, arrow-key navigation through file/commit lists.
- **Right-click context menus** — repos: "Open in Terminal", "Open in Finder", "Copy Path", "Remove from Sidebar". Files: "Copy Path", "Open in Terminal", "Reveal in Finder". Commits: "Copy SHA", "Cherry-pick", "Revert", "Create branch here". Branches: "Copy Name", "Rename", "Delete", "Merge into current".
- **Amend last commit** — checkbox/toggle in `CommitBox.tsx` to amend instead of creating a new commit.
- **Ahead/behind badges** in the sidebar per repo, so sync state is visible without opening it.
- **Cherry-pick & revert** — pick a commit from history and apply it to the current branch, or revert it, without a terminal.
- **Inline blame view** — `git_blame(path)` command + gutter toggle in the diff/file view; click a blamed line to jump to that commit in `HistoryTab`.
- **Tag management** — create, push, and delete tags from the UI; show tags alongside branch labels in history.

## P2 — Nice to have

- **Diff view toggles** — split vs. unified view, ignore-whitespace, word-wrap.
- **File search/filter** in `ChangesTab.tsx`/`FileList.tsx` for repos with large changesets.
- **Interactive rebase** — reorder/squash/edit/drop commits via a drag-orderable list before running `git rebase -i`.
- **Custom sidebar sections** (Favorites, Work, Personal, etc.) to organize repositories instead of one flat list.
- **Commit message templates / history** — recall recently used commit messages, or load a repo's `.gitmessage` template.
- **Drag-and-drop** a folder onto the sidebar to add it as a repo (alternative to `AddRepoMenu.tsx`'s picker).
- **Submodule support** — detect and show submodule status, allow update/init from the UI.
- **Animated status icons** — subtle spinner/pulse on a repo row while fetch/pull/push is running.
