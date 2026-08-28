export type ChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "type_change"
  | "conflicted"
  | "untracked";

export interface FileEntry {
  path: string;
  old_path: string | null;
  status: ChangeKind;
  /** True when staged with no further unstaged changes on top of that. */
  staged: boolean;
  /** True when this path has changes in both the index and the working tree. */
  partially_staged: boolean;
}

export interface RepoStatus {
  files: FileEntry[];
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
}

import type { DiffHunk, FileDiff } from "@gitbud/ui/diff-types";
export type {
  LineKind,
  DiffLine,
  DiffHunk,
  FileDiff,
  ImageDiff,
  ReviewComment,
} from "@gitbud/ui/diff-types";

export interface CommitEntry {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  parent_ids: string[];
  unpushed: boolean;
  lane: number;
  parent_lanes: number[];
  active_lanes: number[];
}

export interface CommitAuthor {
  name: string;
  email: string;
}

export interface CommitDetail {
  oid: string;
  short_oid: string;
  summary: string;
  description: string;
  authors: CommitAuthor[];
  timestamp: number;
  insertions: number;
  deletions: number;
}

export interface CommitSearchResult {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  timestamp: number;
}

export interface TagInfo {
  name: string;
  oid: string;
  message: string | null;
}

export interface BlameLine {
  line_no: number;
  oid: string;
  author_name: string;
  summary: string;
  timestamp: number;
}

export interface RebaseTodoItem {
  oid: string;
  action: "pick" | "squash" | "fixup" | "drop";
}

export interface RebaseResult {
  success: boolean;
  conflicted_oid: string | null;
  conflicted_summary: string | null;
}

export interface SubmoduleInfo {
  name: string;
  path: string;
  url: string | null;
  head_oid: string | null;
  initialized: boolean;
}

export interface RepoEntry {
  path: string;
  name: string;
  group: string;
  last_fetched: number | null;
  sections: string[];
  identity_id: string | null;
}

export interface ConflictSide {
  exists: boolean;
  hunks: DiffHunk[];
}

export interface ConflictSides {
  base_exists: boolean;
  base_text: string;
  ours: ConflictSide;
  theirs: ConflictSide;
}

export interface LfsFileInfo {
  path: string;
  is_lfs: boolean;
  oid: string | null;
  size: number | null;
}

export interface SigningStatus {
  enabled: boolean;
  format: string | null;
  signing_key: string | null;
}

export interface ReflogEntry {
  index: number;
  oid: string;
  message: string;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  is_locked: boolean;
  is_main: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  repo_paths: string[];
}

export interface AheadBehind {
  ahead: number;
  behind: number;
  /** False means the branch has never been pushed — no upstream on `origin` yet. */
  published: boolean;
  /** Whether HEAD's commit already exists on some remote-tracking branch, published or not. */
  head_on_remote: boolean;
}

export interface GitOutputLine {
  stream: "stdout" | "stderr";
  line: string;
}

export interface StashEntry {
  index: number;
  message: string;
}

export interface CherryPickResult {
  conflicted: boolean;
  new_oid: string | null;
}

// --- Settings ---

export type ThemeMode = "light" | "dark" | "system";
export type PullStrategy = "merge" | "rebase" | "ff-only";
export type DiffViewMode = "unified" | "split";
export type DiffAlgorithm = "myers" | "minimal" | "patience";
export type SidebarSort = "name" | "recent" | "group" | "manual";
export type OpenPrAfterCreation = "in-app" | "provider";
export type CacheLevel = "none" | "minimal" | "balanced" | "relaxed";

export interface Settings {
  theme: ThemeMode;
  default_clone_dir: string | null;
  git_name: string | null;
  git_email: string | null;
  default_branch_name: string;
  pull_strategy: PullStrategy;
  diff_view: DiffViewMode;
  ignore_whitespace: boolean;
  diff_font_size: number;
  diff_algorithm: DiffAlgorithm;
  show_ahead_behind: boolean;
  sidebar_sort: SidebarSort;
  auto_stage_new_changes: boolean;
  git_binary_path: string | null;
  fs_watch_enabled: boolean;
  default_identity_id: string | null;
  desktop_notifications: boolean;
  favorite_editor: string | null;
  custom_editor_command: string | null;
  open_pr_after_creation: OpenPrAfterCreation;
  cache_level: CacheLevel;
}

// --- GitHub ---

export interface GitHubAccount {
  login: string;
  name: string | null;
  avatar_url: string;
  email: string;
}

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type PollResult =
  | { status: "pending" }
  | { status: "success"; account: GitHubAccount }
  | { status: "denied" }
  | { status: "expired" };

// --- SSH identities ---

export interface SshIdentity {
  id: string;
  label: string;
  host: string;
  key_path: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  html_url: string;
  author_login: string;
  author_avatar_url: string;
  head_ref: string;
  head_sha: string;
  base_ref: string;
  base_sha: string;
  merged: boolean;
  mergeable: boolean | null;
  labels: string[];
}

export interface Label {
  name: string;
  color: string;
}

export interface Milestone {
  number: number;
  title: string;
  open_issues?: number;
  closed_issues?: number;
}

export interface Project {
  id: string;
  title: string;
}

export interface AssignableUser {
  login: string;
  avatar_url: string;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  diff: FileDiff;
}

export interface RepoMergeSettings {
  allow_merge_commit: boolean;
  allow_squash_merge: boolean;
  allow_rebase_merge: boolean;
  delete_branch_on_merge: boolean;
}

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CommitVerification {
  verified: boolean;
  reason: string;
}

export interface GitHubRepoOwner {
  login: string;
  avatar_url: string;
}

export interface GitHubRepo {
  full_name: string;
  clone_url: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  updated_at: string;
  owner: GitHubRepoOwner;
}
