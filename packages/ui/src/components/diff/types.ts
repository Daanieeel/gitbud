export type LineKind = "context" | "addition" | "deletion";

export interface DiffLine {
  kind: LineKind;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
  /** [start, end) character ranges into `content` that changed at the character level vs. this
   * line's paired counterpart on the other side of the edit. Empty for context lines and for
   * add/delete lines with no counterpart to compare against. */
  highlight_ranges: [number, number][];
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

export interface ReviewComment {
  id: number;
  path: string;
  line: number | null;
  side: "LEFT" | "RIGHT" | null;
  body: string;
  user_login: string;
  user_avatar_url: string;
  created_at: string;
  in_reply_to_id: number | null;
  /** Whether this comment's thread is resolved — populated by the desktop app after joining the
   * GraphQL review-threads response against this REST comment's `id`; `DiffView` itself has no
   * GraphQL knowledge, it only renders whatever's already set here. `undefined` (not `false`)
   * means "resolution status not known yet" — renders as unresolved-looking, never crashes. */
  resolved?: boolean;
}
