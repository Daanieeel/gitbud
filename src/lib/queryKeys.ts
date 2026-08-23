// Central query-key factory. Keeping every key in one place makes cross-cutting invalidation
// (e.g. "everything for this repo path") mechanical instead of a grep-and-hope exercise.
// Every repo-scoped key nests under ["repo", repoPath, ...] so a bare
// `invalidateQueries({queryKey: queryKeys.repo(path)})` refreshes all of it in one call — that's
// what the fs-watcher's `repo-changed` event uses instead of a hand-maintained refresh list.
export const queryKeys = {
  workspaces: ["workspaces"] as const,

  repo: (repoPath: string) => ["repo", repoPath] as const,
  status: (repoPath: string) => ["repo", repoPath, "status"] as const,
  branches: (repoPath: string) => ["repo", repoPath, "branches"] as const,
  aheadBehind: (repoPath: string) => ["repo", repoPath, "ahead-behind"] as const,
  remoteProvider: (repoPath: string) => ["repo", repoPath, "remote-provider"] as const,
  log: (repoPath: string) => ["repo", repoPath, "log"] as const,
  stashes: (repoPath: string) => ["repo", repoPath, "stashes"] as const,
  stashFiles: (repoPath: string, index: number) => ["repo", repoPath, "stash-files", index] as const,
  stashFileDiff: (repoPath: string, index: number, path: string) =>
    ["repo", repoPath, "stash-file-diff", index, path] as const,
  fileDiff: (repoPath: string, path: string) => ["repo", repoPath, "file-diff", path] as const,
  commitFiles: (repoPath: string, oid: string) => ["repo", repoPath, "commit-files", oid] as const,
  commitFileDiff: (repoPath: string, oid: string, path: string) =>
    ["repo", repoPath, "commit-file-diff", oid, path] as const,
  reflog: (repoPath: string) => ["repo", repoPath, "reflog"] as const,
  tags: (repoPath: string) => ["repo", repoPath, "tags"] as const,
  worktrees: (repoPath: string) => ["repo", repoPath, "worktrees"] as const,
  submodules: (repoPath: string) => ["repo", repoPath, "submodules"] as const,
  hasLfs: (repoPath: string) => ["repo", repoPath, "has-lfs"] as const,
};
