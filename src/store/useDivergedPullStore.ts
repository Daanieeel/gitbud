import { create } from "zustand";

interface DivergedPullState {
  /** Repo path a `--ff-only` pull just failed on because the branches have diverged, or null
   * when there's nothing to resolve. Drives ResolveDivergedPullDialog's open state. */
  repoPath: string | null;
  open: (repoPath: string) => void;
  close: () => void;
}

export const useDivergedPullStore = create<DivergedPullState>((set) => ({
  repoPath: null,
  open: (repoPath) => set({ repoPath }),
  close: () => set({ repoPath: null }),
}));

// Git's own hint text for a `--ff-only` pull that can't fast-forward — stable across the git
// versions likely in use: older git omits the "Diverging branches..." hint (advice.diverging
// postdates it) but always includes "Not possible to fast-forward" in the fatal line either way.
const DIVERGED_PULL_PATTERN = /diverging branches can't be fast-forwarded|not possible to fast-forward/i;

export function isDivergedPullError(message: string): boolean {
  return DIVERGED_PULL_PATTERN.test(message);
}
