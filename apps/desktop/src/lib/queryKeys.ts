// Central query-key factory. Keeping every key in one place makes cross-cutting invalidation
// (e.g. "everything for this repo path") mechanical instead of a grep-and-hope exercise.
// Every repo-scoped key nests under ["repo", repoPath, ...] so a bare
// `invalidateQueries({queryKey: queryKeys.repo(path)})` refreshes all of it in one call — that's
// what the fs-watcher's `repo-changed` event uses instead of a hand-maintained refresh list.
export const queryKeys = {
  workspaces: ["workspaces"] as const,
  customEditorIcon: (appPath: string) => ["custom-editor-icon", appPath] as const,

  repo: (repoPath: string) => ["repo", repoPath] as const,
  status: (repoPath: string) => ["repo", repoPath, "status"] as const,
  repoIcon: (repoPath: string) => ["repo", repoPath, "icon"] as const,
  dirty: (repoPath: string) => ["repo", repoPath, "dirty"] as const,
  branches: (repoPath: string) => ["repo", repoPath, "branches"] as const,
  aheadBehind: (repoPath: string) => ["repo", repoPath, "ahead-behind"] as const,
  branchCommits: (repoPath: string, base: string, head: string) =>
    ["repo", repoPath, "branch-commits", base, head] as const,
  remoteProvider: (repoPath: string) => ["repo", repoPath, "remote-provider"] as const,
  log: (repoPath: string) => ["repo", repoPath, "log"] as const,
  stashes: (repoPath: string) => ["repo", repoPath, "stashes"] as const,
  stashFiles: (repoPath: string, index: number) =>
    ["repo", repoPath, "stash-files", index] as const,
  stashFileDiff: (repoPath: string, index: number, path: string) =>
    ["repo", repoPath, "stash-file-diff", index, path] as const,
  fileDiff: (repoPath: string, path: string) => ["repo", repoPath, "file-diff", path] as const,
  commitDetail: (repoPath: string, oid: string) =>
    ["repo", repoPath, "commit-detail", oid] as const,
  commitFiles: (repoPath: string, oid: string) => ["repo", repoPath, "commit-files", oid] as const,
  commitFileDiff: (repoPath: string, oid: string, path: string) =>
    ["repo", repoPath, "commit-file-diff", oid, path] as const,
  reflog: (repoPath: string) => ["repo", repoPath, "reflog"] as const,
  tags: (repoPath: string) => ["repo", repoPath, "tags"] as const,
  worktrees: (repoPath: string) => ["repo", repoPath, "worktrees"] as const,
  submodules: (repoPath: string) => ["repo", repoPath, "submodules"] as const,
  hasLfs: (repoPath: string) => ["repo", repoPath, "has-lfs"] as const,

  // GitHub/PR domain — keyed by (repoPath, login) rather than nested under "repo" since login
  // also varies independently (switching accounts on the same repo).
  prList: (repoPath: string, login: string, filter: string) =>
    ["pr-list", repoPath, login, filter] as const,
  prDetail: (repoPath: string, login: string, number: number) =>
    ["pr-detail", repoPath, login, number] as const,
  checkRuns: (repoPath: string, login: string, sha: string) =>
    ["check-runs", repoPath, login, sha] as const,
  prMeta: (repoPath: string, login: string, number: number) =>
    ["pr-meta", repoPath, login, number] as const,
  prCommits: (repoPath: string, login: string, number: number, headSha: string) =>
    ["pr-commits", repoPath, login, number, headSha] as const,
  commitDiffFiles: (repoPath: string, login: string, sha: string) =>
    ["pr-commit-diff-files", repoPath, login, sha] as const,
  prIssueComments: (repoPath: string, login: string, number: number) =>
    ["pr-issue-comments", repoPath, login, number] as const,
  prTimelineEvents: (repoPath: string, login: string, number: number) =>
    ["pr-timeline-events", repoPath, login, number] as const,
  prReviews: (repoPath: string, login: string, number: number) =>
    ["pr-reviews", repoPath, login, number] as const,
  reviewThreads: (repoPath: string, login: string, number: number) =>
    ["review-threads", repoPath, login, number] as const,
  viewedFiles: (repoPath: string, login: string, number: number) =>
    ["viewed-files", repoPath, login, number] as const,
  prLabels: (repoPath: string, login: string) => ["pr-labels", repoPath, login] as const,
  assignableUsers: (repoPath: string, login: string) =>
    ["assignable-users", repoPath, login] as const,
  repoTeams: (repoPath: string, login: string) => ["repo-teams", repoPath, login] as const,
  repoIssues: (repoPath: string, login: string) => ["repo-issues", repoPath, login] as const,
  milestones: (repoPath: string, login: string) => ["milestones", repoPath, login] as const,
  projects: (repoPath: string, login: string) => ["projects", repoPath, login] as const,
  issueStates: (repoPath: string, login: string, numbers: number[]) =>
    ["issue-states", repoPath, login, numbers] as const,
  branchProtection: (repoPath: string, login: string, branch: string) =>
    ["branch-protection", repoPath, login, branch] as const,
  prArchived: (repoPath: string, number: number) => ["pr-archived", repoPath, number] as const,
  compare: (repoPath: string, login: string, base: string, head: string) =>
    ["pr-compare", repoPath, login, base, head] as const,
};
