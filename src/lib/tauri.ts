import { invoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  BranchInfo,
  CommitEntry,
  FileDiff,
  RepoEntry,
  RepoStatus,
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

  getFileDiff: (repoPath: string, path: string, staged: boolean) =>
    invoke<FileDiff>("get_file_diff", { repoPath, path, staged }),
  getCommitFiles: (repoPath: string, oid: string) =>
    invoke<[string, string][]>("get_commit_files", { repoPath, oid }),
  getCommitFileDiff: (repoPath: string, oid: string, path: string) =>
    invoke<FileDiff>("get_commit_file_diff", { repoPath, oid, path }),

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
};
