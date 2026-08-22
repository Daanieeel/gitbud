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
  staged: boolean;
}

export interface RepoStatus {
  files: FileEntry[];
}

export interface BranchInfo {
  name: string;
  is_head: boolean;
  is_remote: boolean;
}

export type LineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  kind: LineKind;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  old_path: string | null;
  is_binary: boolean;
  is_image: boolean;
  hunks: DiffHunk[];
}

export interface ImageDiff {
  old: string | null;
  new: string | null;
}

export interface CommitEntry {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  author_email: string;
  timestamp: number;
}

export interface RepoEntry {
  path: string;
  name: string;
  group: string;
  is_private: boolean;
  last_fetched: number | null;
}

export interface AheadBehind {
  ahead: number;
  behind: number;
}

export interface GitOutputLine {
  stream: "stdout" | "stderr";
  line: string;
}

export interface StashEntry {
  index: number;
  message: string;
}

// --- GitHub ---

export interface GitHubAccount {
  login: string;
  name: string | null;
  avatar_url: string;
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

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  html_url: string;
  author_login: string;
  head_ref: string;
  head_sha: string;
  base_ref: string;
  merged: boolean;
  mergeable: boolean | null;
}

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  body: string;
  user_login: string;
  created_at: string;
  in_reply_to_id: number | null;
}

export interface PullRequestFile {
  filename: string;
  status: string;
  diff: FileDiff;
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

export interface GitHubRepo {
  full_name: string;
  clone_url: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  updated_at: string;
}
