import { invoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  BranchInfo,
  CommitEntry,
  DeviceCodeResponse,
  FileDiff,
  GitHubAccount,
  ImageDiff,
  PollResult,
  PullRequest,
  PullRequestFile,
  RepoEntry,
  RepoStatus,
  ReviewComment,
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
  stagePaths: (repoPath: string, paths: string[]) =>
    invoke<void>("stage_paths", { repoPath, paths }),
  unstagePaths: (repoPath: string, paths: string[]) =>
    invoke<void>("unstage_paths", { repoPath, paths }),
  commit: (repoPath: string, summary: string, description: string) =>
    invoke<string>("commit", { repoPath, summary, description }),

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

  startWatch: (repoPath: string) => invoke<void>("start_watch", { repoPath }),
  stopWatch: (repoPath: string) => invoke<void>("stop_watch", { repoPath }),

  // --- GitHub ---
  githubGetClientId: () => invoke<string | null>("github_get_client_id"),
  githubSetClientId: (clientId: string) => invoke<void>("github_set_client_id", { clientId }),
  githubListAccounts: () => invoke<GitHubAccount[]>("github_list_accounts"),
  githubRemoveAccount: (login: string) =>
    invoke<GitHubAccount[]>("github_remove_account", { login }),
  githubStartDeviceFlow: (clientId: string) =>
    invoke<DeviceCodeResponse>("github_start_device_flow", { clientId }),
  githubPollDeviceFlow: (clientId: string, deviceCode: string) =>
    invoke<PollResult>("github_poll_device_flow", { clientId, deviceCode }),
  githubRemoteOwnerRepo: (repoPath: string) =>
    invoke<[string, string] | null>("github_remote_owner_repo", { repoPath }),
  githubListPullRequests: (repoPath: string, login: string) =>
    invoke<PullRequest[]>("github_list_pull_requests", { repoPath, login }),
  githubGetPullRequest: (repoPath: string, login: string, number: number) =>
    invoke<PullRequest>("github_get_pull_request", { repoPath, login, number }),
  githubCreatePullRequest: (
    repoPath: string,
    login: string,
    title: string,
    head: string,
    base: string,
    body: string,
  ) => invoke<PullRequest>("github_create_pull_request", { repoPath, login, title, head, base, body }),
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
};
