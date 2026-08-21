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
  hunks: DiffHunk[];
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
