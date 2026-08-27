import { create } from "zustand";

interface UnstagedPullState {
  /** Repo path a pull-with-rebase just failed on because of unstaged/uncommitted local
   * changes, or null when there's nothing to resolve. Drives ResolveUnstagedPullDialog's
   * open state. */
  repoPath: string | null;
  open: (repoPath: string) => void;
  close: () => void;
}

export const useUnstagedPullStore = create<UnstagedPullState>((set) => ({
  repoPath: null,
  open: (repoPath) => set({ repoPath }),
  close: () => set({ repoPath: null }),
}));

// Git's own fatal text for a rebase-mode pull blocked by a dirty working tree — stable across
// git versions: "error: cannot pull with rebase: You have unstaged changes." followed by
// "error: Please commit or stash them.". Matching on either half covers both message lines.
const UNSTAGED_PULL_PATTERN = /cannot pull with rebase|please commit or stash them/i;

export function isUnstagedChangesPullError(message: string): boolean {
  return UNSTAGED_PULL_PATTERN.test(message);
}
