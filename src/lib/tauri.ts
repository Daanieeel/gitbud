import { invoke } from "@tauri-apps/api/core";
import type {
  AheadBehind,
  AssignableUser,
  BlameLine,
  BranchInfo,
  CheckRun,
  CherryPickResult,
  CommitDetail,
  CommitEntry,
  ConflictSides,
  CommitSearchResult,
  CommitVerification,
  DeviceCodeResponse,
  FileDiff,
  GitHubAccount,
  GitHubRepo,
  ImageDiff,
  Label,
  Milestone,
  Project,
  LfsFileInfo,
  PollResult,
  PullRequest,
  PullRequestFile,
  RebaseResult,
  RebaseTodoItem,
  RepoEntry,
  RepoMergeSettings,
  ReflogEntry,
  RepoStatus,
  SigningStatus,
  ReviewComment,
  Settings,
  SshIdentity,
  StashEntry,
  SubmoduleInfo,
  TagInfo,
  Workspace,
  WorktreeInfo,
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
  addToGitignore: (repoPath: string, paths: string[]) => invoke<void>("add_to_gitignore", { repoPath, paths }),
  resolveConflict: (repoPath: string, path: string, side: "ours" | "theirs") =>
    invoke<void>("resolve_conflict", { repoPath, path, side }),
  getConflictSides: (repoPath: string, path: string) =>
    invoke<ConflictSides>("get_conflict_sides", { repoPath, path }),
  resolveConflictWithContent: (repoPath: string, path: string, content: string) =>
    invoke<void>("resolve_conflict_with_content", { repoPath, path, content }),

  hasGpg: () => invoke<boolean>("has_gpg"),
  listGpgKeys: () => invoke<[string, string][]>("list_gpg_keys"),
  generateGpgKey: (name: string, email: string) => invoke<string>("generate_gpg_key", { name, email }),
  generateSshSigningKey: (path: string, email: string) =>
    invoke<string>("generate_ssh_signing_key", { path, email }),
  configureSigning: (repoPath: string, format: string, signingKey: string, global: boolean) =>
    invoke<void>("configure_signing", { repoPath, format, signingKey, global }),
  disableSigning: (repoPath: string, global: boolean) => invoke<void>("disable_signing", { repoPath, global }),
  getSigningStatus: (repoPath: string) => invoke<SigningStatus>("get_signing_status", { repoPath }),
  readWorkingFile: (repoPath: string, path: string) =>
    invoke<string>("read_working_file", { repoPath, path }),
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
  undoLastCommit: (repoPath: string) => invoke<[string, string]>("undo_last_commit", { repoPath }),
  cherryPick: (repoPath: string, oid: string) =>
    invoke<CherryPickResult>("cherry_pick", { repoPath, oid }),
  revertCommit: (repoPath: string, oid: string) =>
    invoke<CherryPickResult>("revert_commit", { repoPath, oid }),
  deleteBranch: (repoPath: string, name: string) =>
    invoke<void>("delete_branch", { repoPath, name }),
  deleteBranchRemote: (repoPath: string, name: string) =>
    invoke<void>("delete_branch_remote", { repoPath, name }),
  isBranchMerged: (repoPath: string, branch: string, target: string) =>
    invoke<boolean>("is_branch_merged", { repoPath, branch, target }),
  renameBranch: (repoPath: string, oldName: string, newName: string) =>
    invoke<void>("rename_branch", { repoPath, oldName, newName }),
  renameBranchRemote: (repoPath: string, oldName: string, newName: string) =>
    invoke<void>("rename_branch_remote", { repoPath, oldName, newName }),
  mergeBranch: (repoPath: string, branchName: string) =>
    invoke<CherryPickResult>("merge_branch", { repoPath, branchName }),

  listStashes: (repoPath: string) => invoke<StashEntry[]>("list_stashes", { repoPath }),
  stashSave: (repoPath: string, message: string, includeUntracked: boolean) =>
    invoke<void>("stash_save", { repoPath, message, includeUntracked }),
  stashApply: (repoPath: string, index: number) =>
    invoke<void>("stash_apply", { repoPath, index }),
  stashPop: (repoPath: string, index: number) => invoke<void>("stash_pop", { repoPath, index }),
  stashDrop: (repoPath: string, index: number) => invoke<void>("stash_drop", { repoPath, index }),
  getStashOid: (repoPath: string, index: number) => invoke<string>("get_stash_oid", { repoPath, index }),
  stashApplyFile: (repoPath: string, index: number, path: string) =>
    invoke<void>("stash_apply_file", { repoPath, index, path }),

  getFileDiff: (repoPath: string, path: string, staged: boolean) =>
    invoke<FileDiff>("get_file_diff", { repoPath, path, staged }),
  getCommitFiles: (repoPath: string, oid: string) =>
    invoke<[string, string][]>("get_commit_files", { repoPath, oid }),
  getCommitDetail: (repoPath: string, oid: string) =>
    invoke<CommitDetail>("get_commit_detail", { repoPath, oid }),
  getCommitFileDiff: (repoPath: string, oid: string, path: string) =>
    invoke<FileDiff>("get_commit_file_diff", { repoPath, oid, path }),
  getBranchDiffFiles: (repoPath: string, base: string, head: string) =>
    invoke<[string, string][]>("get_branch_diff_files", { repoPath, base, head }),
  getBranchDiffFile: (repoPath: string, base: string, head: string, path: string) =>
    invoke<FileDiff>("get_branch_diff_file", { repoPath, base, head, path }),
  getBranchImageDiff: (repoPath: string, base: string, head: string, path: string) =>
    invoke<ImageDiff>("get_branch_image_diff", { repoPath, base, head, path }),
  getImageDiff: (repoPath: string, path: string, staged: boolean) =>
    invoke<ImageDiff>("get_image_diff", { repoPath, path, staged }),
  getCommitImageDiff: (repoPath: string, oid: string, path: string) =>
    invoke<ImageDiff>("get_commit_image_diff", { repoPath, oid, path }),

  getLog: (repoPath: string, limit: number, skip: number) =>
    invoke<CommitEntry[]>("get_log", { repoPath, limit, skip }),
  searchCommits: (repoPath: string, query: string, limit: number) =>
    invoke<CommitSearchResult[]>("search_commits", { repoPath, query, limit }),
  getBranchCommits: (repoPath: string, base: string, head: string) =>
    invoke<CommitSearchResult[]>("get_branch_commits", { repoPath, base, head }),

  listTags: (repoPath: string) => invoke<TagInfo[]>("list_tags", { repoPath }),
  createTag: (repoPath: string, name: string, message: string) =>
    invoke<void>("create_tag", { repoPath, name, message }),
  deleteTag: (repoPath: string, name: string) => invoke<void>("delete_tag", { repoPath, name }),
  pushTag: (repoPath: string, name: string) => invoke<void>("push_tag", { repoPath, name }),

  blameFile: (repoPath: string, path: string) =>
    invoke<BlameLine[]>("blame_file", { repoPath, path }),

  interactiveRebase: (repoPath: string, baseOid: string, todo: RebaseTodoItem[]) =>
    invoke<RebaseResult>("interactive_rebase", { repoPath, baseOid, todo }),

  listSubmodules: (repoPath: string) => invoke<SubmoduleInfo[]>("list_submodules", { repoPath }),
  updateSubmodule: (repoPath: string, submodulePath: string) =>
    invoke<void>("update_submodule", { repoPath, submodulePath }),
  updateAllSubmodules: (repoPath: string) =>
    invoke<void>("update_all_submodules", { repoPath }),

  loadRepos: () => invoke<RepoEntry[]>("load_repos"),
  addRepo: (path: string) => invoke<RepoEntry[]>("add_repo", { path }),
  removeRepo: (path: string) => invoke<RepoEntry[]>("remove_repo", { path }),
  addRepoSection: (path: string, section: string) =>
    invoke<RepoEntry[]>("add_repo_section", { path, section }),
  removeRepoSection: (path: string, section: string) =>
    invoke<RepoEntry[]>("remove_repo_section", { path, section }),
  removeSection: (section: string) => invoke<RepoEntry[]>("remove_section", { section }),
  renameSection: (oldName: string, newName: string) =>
    invoke<RepoEntry[]>("rename_section", { old: oldName, new: newName }),
  setRepoIdentity: (path: string, identityId: string | null) =>
    invoke<RepoEntry[]>("set_repo_identity", { path, identityId }),
  setRepoOrder: (order: string[]) => invoke<RepoEntry[]>("set_repo_order", { order }),

  listWorkspaces: () => invoke<Workspace[]>("list_workspaces"),
  createWorkspace: (name: string, repoPaths: string[]) =>
    invoke<Workspace[]>("create_workspace", { name, repoPaths }),
  updateWorkspace: (id: string, name: string, repoPaths: string[]) =>
    invoke<Workspace[]>("update_workspace", { id, name, repoPaths }),
  deleteWorkspace: (id: string) => invoke<Workspace[]>("delete_workspace", { id }),

  listWorktrees: (repoPath: string) => invoke<WorktreeInfo[]>("list_worktrees", { repoPath }),
  addWorktree: (repoPath: string, path: string, branch: string, createBranch: boolean) =>
    invoke<void>("add_worktree", { repoPath, path, branch, createBranch }),
  removeWorktree: (repoPath: string, worktreePath: string, force: boolean) =>
    invoke<void>("remove_worktree", { repoPath, worktreePath, force }),

  getReflog: (repoPath: string) => invoke<ReflogEntry[]>("get_reflog", { repoPath }),
  reflogRestore: (repoPath: string, oid: string) =>
    invoke<void>("reflog_restore", { repoPath, oid }),

  hasLfs: (repoPath: string) => invoke<boolean>("has_lfs", { repoPath }),
  checkLfsFiles: (repoPath: string, paths: string[]) =>
    invoke<LfsFileInfo[]>("check_lfs_files", { repoPath, paths }),
  gitLfsPull: (repoPath: string) => invoke<void>("git_lfs_pull", { repoPath }),
  gitLfsPush: (repoPath: string, branch: string) => invoke<void>("git_lfs_push", { repoPath, branch }),
  initRepo: (path: string) => invoke<void>("init_repo", { path }),

  listSshIdentities: () => invoke<SshIdentity[]>("list_ssh_identities"),
  addSshIdentity: (label: string, host: string, keyPath: string) =>
    invoke<SshIdentity[]>("add_ssh_identity", { label, host, keyPath }),
  removeSshIdentity: (id: string) => invoke<SshIdentity[]>("remove_ssh_identity", { id }),
  applySshIdentityToRepo: (repoPath: string, keyPath: string) =>
    invoke<void>("apply_ssh_identity_to_repo", { repoPath, keyPath }),
  clearSshIdentityFromRepo: (repoPath: string) =>
    invoke<void>("clear_ssh_identity_from_repo", { repoPath }),

  gitFetch: (repoPath: string) => invoke<void>("git_fetch", { repoPath }),
  gitPull: (repoPath: string) => invoke<void>("git_pull", { repoPath }),
  gitPullWithStrategy: (repoPath: string, strategy: "merge" | "rebase") =>
    invoke<void>("git_pull_with_strategy", { repoPath, strategy }),
  gitAbortPull: (repoPath: string) => invoke<void>("git_abort_pull", { repoPath }),
  gitPush: (repoPath: string) => invoke<void>("git_push", { repoPath }),
  gitClone: (url: string, dest: string) => invoke<void>("git_clone", { url, dest }),
  cancelGitOperation: (eventId: string) => invoke<void>("cancel_git_operation", { repoPath: eventId }),
  getAheadBehind: (repoPath: string) => invoke<AheadBehind>("get_ahead_behind", { repoPath }),
  hasUpstreamRemote: (repoPath: string) => invoke<boolean>("has_upstream_remote", { repoPath }),
  remoteWebInfo: (repoPath: string) => invoke<[string, string] | null>("remote_web_info", { repoPath }),
  getUpstreamAheadBehind: (repoPath: string, branch: string) =>
    invoke<AheadBehind | null>("get_upstream_ahead_behind", { repoPath, branch }),
  syncUpstream: (repoPath: string, branch: string) =>
    invoke<void>("sync_upstream", { repoPath, branch }),
  checkoutPullRequest: (repoPath: string, number: number) =>
    invoke<string>("checkout_pull_request", { repoPath, number }),

  openInTerminal: (path: string) => invoke<void>("open_in_terminal", { path }),
  openInEditor: (path: string, editor: string, customCommand: string | null) =>
    invoke<void>("open_in_editor", { path, editor, customCommand }),
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<void>("save_settings", { settings }),
  exportSettings: (destPath: string) => invoke<void>("export_settings", { destPath }),
  importSettings: (srcPath: string) => invoke<Settings>("import_settings", { srcPath }),
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
  githubHasToken: (login: string) => invoke<boolean>("github_has_token", { login }),
  githubStartDeviceFlow: (clientId: string) =>
    invoke<DeviceCodeResponse>("github_start_device_flow", { clientId }),
  githubPollDeviceFlow: (clientId: string, deviceCode: string) =>
    invoke<PollResult>("github_poll_device_flow", { clientId, deviceCode }),
  githubRemoteOwnerRepo: (repoPath: string) =>
    invoke<[string, string] | null>("github_remote_owner_repo", { repoPath }),
  githubListPullRequests: (repoPath: string, login: string, state: "open" | "closed" | "all", page: number) =>
    invoke<PullRequest[]>("github_list_pull_requests", { repoPath, login, state, page }),
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
  githubUpdatePullRequestBase: (repoPath: string, login: string, number: number, base: string) =>
    invoke<void>("github_update_pull_request_base", { repoPath, login, number, base }),
  githubListLabels: (repoPath: string, login: string) =>
    invoke<Label[]>("github_list_labels", { repoPath, login }),
  githubListAssignableUsers: (repoPath: string, login: string) =>
    invoke<AssignableUser[]>("github_list_assignable_users", { repoPath, login }),
  githubAddLabels: (repoPath: string, login: string, number: number, labels: string[]) =>
    invoke<void>("github_add_labels", { repoPath, login, number, labels }),
  githubAddAssignees: (repoPath: string, login: string, number: number, assignees: string[]) =>
    invoke<void>("github_add_assignees", { repoPath, login, number, assignees }),
  githubRequestReviewers: (repoPath: string, login: string, number: number, reviewers: string[]) =>
    invoke<void>("github_request_reviewers", { repoPath, login, number, reviewers }),
  githubListMilestones: (repoPath: string, login: string) =>
    invoke<Milestone[]>("github_list_milestones", { repoPath, login }),
  githubSetMilestone: (repoPath: string, login: string, number: number, milestone: number) =>
    invoke<void>("github_set_milestone", { repoPath, login, number, milestone }),
  githubListProjects: (repoPath: string, login: string) =>
    invoke<Project[]>("github_list_projects", { repoPath, login }),
  githubAddPullRequestToProject: (repoPath: string, login: string, number: number, projectId: string) =>
    invoke<void>("github_add_pull_request_to_project", { repoPath, login, number, projectId }),
  githubMergePullRequest: (
    repoPath: string,
    login: string,
    number: number,
    mergeMethod: string,
    commitTitle: string | null,
    commitMessage: string | null,
    sha: string | null,
  ) =>
    invoke<void>("github_merge_pull_request", {
      repoPath,
      login,
      number,
      mergeMethod,
      commitTitle,
      commitMessage,
      sha,
    }),
  githubDeleteRemoteBranch: (repoPath: string, login: string, branch: string) =>
    invoke<void>("github_delete_remote_branch", { repoPath, login, branch }),
  githubGetRepoMergeSettings: (repoPath: string, login: string, baseRef: string) =>
    invoke<RepoMergeSettings>("github_get_repo_merge_settings", { repoPath, login, baseRef }),
  githubFindUserAvatarByEmail: (repoPath: string, login: string, email: string) =>
    invoke<string | null>("github_find_user_avatar_by_email", { repoPath, login, email }),
  githubListPullRequestFiles: (repoPath: string, login: string, number: number) =>
    invoke<[string, string, FileDiff][]>("github_list_pull_request_files", {
      repoPath,
      login,
      number,
    }).then((rows): PullRequestFile[] =>
      rows.map(([filename, status, diff]) => ({ filename, status, diff })),
    ),
  githubGetPullRequestImageDiff: (
    repoPath: string,
    login: string,
    path: string,
    baseSha: string,
    headSha: string,
  ) =>
    invoke<ImageDiff>("github_get_pull_request_image_diff", { repoPath, login, path, baseSha, headSha }),
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
