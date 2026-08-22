import { invoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  BranchInfo,
  CheckRun,
  CherryPickResult,
  CommitEntry,
  CommitVerification,
  DeviceCodeResponse,
  FileDiff,
  GitHubAccount,
  GitHubRepo,
  ImageDiff,
  PollResult,
  PullRequest,
  PullRequestFile,
  RepoEntry,
  RepoStatus,
  ReviewComment,
  Settings,
  StashEntry,
} from "./types";

export const api = {
  getStatus: (repoPath: string) => invoke<RepoStatus>("get_status", { repoPath }),
  isDirty: (repoPath: string) => invoke<boolean>("is_dirty", { repoPath }),
  getCurrentBranch: (repoPath: string) => invoke<string>("get_current_branch", { repoPath }),
  listBranches: (repoPath: string) => invoke<BranchInfo[]>("list_branches", { repoPath }),
  checkoutBranch: (repoPath: string, branch: string) =>
    invoke<void>("checkout_branch", { repoPath, branch }),
  createBranch: (repoPath: string, name: string, checkout: boolean) =>
    invoke<void>("create_branch", { repoPath, name, checkout }),
  createBranchAt: (repoPath: string, name: string, oid: string, checkout: boolean) =>
    invoke<void>("create_branch_at", { repoPath, name, oid, checkout }),
  stagePaths: (repoPath: string, paths: string[]) =>
    invoke<void>("stage_paths", { repoPath, paths }),
  unstagePaths: (repoPath: string, paths: string[]) =>
    invoke<void>("unstage_paths", { repoPath, paths }),
  discardFile: (repoPath: string, path: string) => invoke<void>("discard_file", { repoPath, path }),
  stageHunk: (repoPath: string, path: string, hunkIndex: number) =>
    invoke<void>("stage_hunk", { repoPath, path, hunkIndex }),
  unstageHunk: (repoPath: string, path: string, hunkIndex: number) =>
    invoke<void>("unstage_hunk", { repoPath, path, hunkIndex }),
  discardHunk: (repoPath: string, path: string, hunkIndex: number) =>
    invoke<void>("discard_hunk", { repoPath, path, hunkIndex }),
  commit: (repoPath: string, summary: string, description: string) =>
    invoke<string>("commit", { repoPath, summary, description }),
  amendCommit: (repoPath: string, summary: string, description: string) =>
    invoke<string>("amend_commit", { repoPath, summary, description }),
  cherryPick: (repoPath: string, oid: string) =>
    invoke<CherryPickResult>("cherry_pick", { repoPath, oid }),
  revertCommit: (repoPath: string, oid: string) =>
    invoke<CherryPickResult>("revert_commit", { repoPath, oid }),
  deleteBranch: (repoPath: string, name: string) =>
    invoke<void>("delete_branch", { repoPath, name }),
  renameBranch: (repoPath: string, oldName: string, newName: string) =>
    invoke<void>("rename_branch", { repoPath, oldName, newName }),
  mergeBranch: (repoPath: string, branchName: string) =>
    invoke<CherryPickResult>("merge_branch", { repoPath, branchName }),

  listStashes: (repoPath: string) => invoke<StashEntry[]>("list_stashes", { repoPath }),
  stashSave: (repoPath: string, message: string, includeUntracked: boolean) =>
    invoke<void>("stash_save", { repoPath, message, includeUntracked }),
  stashApply: (repoPath: string, index: number) =>
    invoke<void>("stash_apply", { repoPath, index }),
  stashPop: (repoPath: string, index: number) => invoke<void>("stash_pop", { repoPath, index }),
  stashDrop: (repoPath: string, index: number) => invoke<void>("stash_drop", { repoPath, index }),

  getFileDiff: (repoPath: string, path: string, staged: boolean) =>
    invoke<FileDiff>("get_file_diff", { repoPath, path, staged }),
  getCommitFiles: (repoPath: string, oid: string) =>
    invoke<[string, string][]>("get_commit_files", { repoPath, oid }),
  getCommitFileDiff: (repoPath: string, oid: string, path: string) =>
    invoke<FileDiff>("get_commit_file_diff", { repoPath, oid, path }),
  getImageDiff: (repoPath: string, path: string, staged: boolean) =>
    invoke<ImageDiff>("get_image_diff", { repoPath, path, staged }),
  getCommitImageDiff: (repoPath: string, oid: string, path: string) =>
    invoke<ImageDiff>("get_commit_image_diff", { repoPath, oid, path }),

  getLog: (repoPath: string, limit: number, skip: number) =>
    invoke<CommitEntry[]>("get_log", { repoPath, limit, skip }),

  loadRepos: () => invoke<RepoEntry[]>("load_repos"),
  addRepo: (path: string) => invoke<RepoEntry[]>("add_repo", { path }),
  removeRepo: (path: string) => invoke<RepoEntry[]>("remove_repo", { path }),
  setRepoPrivate: (path: string, isPrivate: boolean) =>
    invoke<RepoEntry[]>("set_repo_private", { path, isPrivate }),
  initRepo: (path: string) => invoke<void>("init_repo", { path }),

  gitFetch: (repoPath: string) => invoke<void>("git_fetch", { repoPath }),
  gitPull: (repoPath: string) => invoke<void>("git_pull", { repoPath }),
  gitPush: (repoPath: string) => invoke<void>("git_push", { repoPath }),
  gitClone: (url: string, dest: string) => invoke<void>("git_clone", { url, dest }),
  getAheadBehind: (repoPath: string) => invoke<AheadBehind>("get_ahead_behind", { repoPath }),
  hasUpstreamRemote: (repoPath: string) => invoke<boolean>("has_upstream_remote", { repoPath }),
  getUpstreamAheadBehind: (repoPath: string, branch: string) =>
    invoke<AheadBehind | null>("get_upstream_ahead_behind", { repoPath, branch }),
  syncUpstream: (repoPath: string, branch: string) =>
    invoke<void>("sync_upstream", { repoPath, branch }),
  checkoutPullRequest: (repoPath: string, number: number) =>
    invoke<string>("checkout_pull_request", { repoPath, number }),

  openInTerminal: (path: string) => invoke<void>("open_in_terminal", { path }),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  getGitIdentity: (repoPath: string) =>
    invoke<[string | null, string | null]>("get_git_identity", { repoPath }),
  setGitIdentity: (repoPath: string, name: string, email: string, global: boolean) =>
    invoke<void>("set_git_identity", { repoPath, name, email, global }),
  startWatch: (repoPath: string) => invoke<void>("start_watch", { repoPath }),
  stopWatch: (repoPath: string) => invoke<void>("stop_watch", { repoPath }),

  // --- GitHub ---
  githubDetectGhCli: () => invoke<GitHubAccount | null>("github_detect_gh_cli"),
  githubGetClientId: () => invoke<string | null>("github_get_client_id"),
  githubSetClientId: (clientId: string) => invoke<void>("github_set_client_id", { clientId }),
  githubGetHost: () => invoke<string>("github_get_host"),
  githubSetHost: (host: string) => invoke<void>("github_set_host", { host }),
  githubListAccounts: () => invoke<GitHubAccount[]>("github_list_accounts"),
  githubRemoveAccount: (login: string) =>
    invoke<GitHubAccount[]>("github_remove_account", { login }),
  githubStartDeviceFlow: (clientId: string) =>
    invoke<DeviceCodeResponse>("github_start_device_flow", { clientId }),
  githubPollDeviceFlow: (clientId: string, deviceCode: string) =>
    invoke<PollResult>("github_poll_device_flow", { clientId, deviceCode }),
  githubRemoteOwnerRepo: (repoPath: string) =>
    invoke<[string, string] | null>("github_remote_owner_repo", { repoPath }),
  githubListPullRequests: (repoPath: string, login: string, state: "open" | "closed" | "all") =>
    invoke<PullRequest[]>("github_list_pull_requests", { repoPath, login, state }),
  githubGetPullRequest: (repoPath: string, login: string, number: number) =>
    invoke<PullRequest>("github_get_pull_request", { repoPath, login, number }),
  githubCreatePullRequest: (
    repoPath: string,
    login: string,
    title: string,
    head: string,
    base: string,
    body: string,
    draft: boolean,
  ) =>
    invoke<PullRequest>("github_create_pull_request", {
      repoPath,
      login,
      title,
      head,
      base,
      body,
      draft,
    }),
  readPrTemplate: (repoPath: string) => invoke<string | null>("read_pr_template", { repoPath }),
  githubMergePullRequest: (repoPath: string, login: string, number: number, mergeMethod: string) =>
    invoke<void>("github_merge_pull_request", { repoPath, login, number, mergeMethod }),
  githubListPullRequestFiles: (repoPath: string, login: string, number: number) =>
    invoke<[string, string, FileDiff][]>("github_list_pull_request_files", {
      repoPath,
      login,
      number,
    }).then((rows): PullRequestFile[] =>
      rows.map(([filename, status, diff]) => ({ filename, status, diff })),
    ),
  githubListReviewComments: (repoPath: string, login: string, number: number) =>
    invoke<ReviewComment[]>("github_list_review_comments", { repoPath, login, number }),
  githubCreateReviewComment: (
    repoPath: string,
    login: string,
    number: number,
    commitId: string,
    path: string,
    line: number,
    side: "LEFT" | "RIGHT",
    body: string,
  ) =>
    invoke<ReviewComment>("github_create_review_comment", {
      repoPath,
      login,
      number,
      commitId,
      path,
      line,
      side,
      body,
    }),
  githubListCheckRuns: (repoPath: string, login: string, sha: string) =>
    invoke<CheckRun[]>("github_list_check_runs", { repoPath, login, sha }),
  githubGetCommitVerification: (repoPath: string, login: string, sha: string) =>
    invoke<CommitVerification>("github_get_commit_verification", { repoPath, login, sha }),
  githubListUserRepos: (login: string) =>
    invoke<GitHubRepo[]>("github_list_user_repos", { login }),
};
