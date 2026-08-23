// Central query-key factory. Keeping every key in one place makes cross-cutting invalidation
// (e.g. "everything for this repo path") mechanical instead of a grep-and-hope exercise.
export const queryKeys = {
  workspaces: ["workspaces"] as const,

  repo: (repoPath: string) => ["repo", repoPath] as const,
  tags: (repoPath: string) => ["repo", repoPath, "tags"] as const,
  worktrees: (repoPath: string) => ["repo", repoPath, "worktrees"] as const,
  submodules: (repoPath: string) => ["repo", repoPath, "submodules"] as const,
  hasLfs: (repoPath: string) => ["repo", repoPath, "has-lfs"] as const,
};
