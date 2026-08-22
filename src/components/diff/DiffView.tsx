import { memo, useMemo, useState } from "react";
import { ColumnsIcon, LinkIcon, MessageSquarePlusIcon, RowsIcon } from "lucide-react";
import type { DiffHunk, DiffLine, FileDiff, ImageDiff, ReviewComment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImageDiffView } from "./ImageDiffView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSettingsStore } from "@/store/useSettingsStore";
import { highlightLine, languageForPath } from "@/lib/highlight";

interface HunkActions {
  /** Whether the diff being shown is the staged (HEAD->index) or unstaged (index->workdir) side. */
  staged: boolean;
  onStage?: (hunkIndex: number) => void;
  onUnstage?: (hunkIndex: number) => void;
  onDiscard?: (hunkIndex: number) => void;
}

interface DiffViewProps {
  path: string | null;
  diff: FileDiff | null;
  imageDiff?: ImageDiff | null;
  comments?: ReviewComment[];
  onAddComment?: (line: number, side: "LEFT" | "RIGHT", body: string) => Promise<void> | void;
  onCopyPermalink?: (line: number) => void;
  hunkActions?: HunkActions;
}

function commentsForLine(
  comments: ReviewComment[] | undefined,
  oldLineno: number | null,
  newLineno: number | null,
): ReviewComment[] {
  if (!comments) return [];
  return comments.filter((c) => {
    if (c.side === "LEFT") return c.line === oldLineno;
    return c.line === newLineno;
  });
}

function CommentThread({ comments }: { comments: ReviewComment[] }) {
  if (comments.length === 0) return null;
  return (
    <div className="ml-16 flex flex-col gap-1 border-l-2 border-primary bg-card px-3 py-2">
      {comments.map((c) => (
        <div key={c.id} className="text-xs">
          <span className="font-medium">{c.user_login}</span>{" "}
          <span className="text-muted-foreground">
            {new Date(c.created_at).toLocaleDateString()}
          </span>
          <p className="whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
    </div>
  );
}

function AddCommentComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (body: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(body.trim());
      setBody("");
      onCancel();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ml-16 flex flex-col gap-2 border-l-2 border-primary bg-card px-3 py-2">
      <Textarea
        autoFocus
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment"
        className="px-2 py-1 text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={submitting || !body.trim()} onClick={() => void submit()}>
          Comment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function HunkHeader({ hunk, hunkIdx, hunkActions }: { hunk: DiffHunk; hunkIdx: number; hunkActions?: HunkActions }) {
  return (
    <div className="flex items-center justify-between bg-muted px-3 py-1 text-muted-foreground">
      <span>{hunk.header}</span>
      {hunkActions && (
        <span className="flex gap-1.5 text-xs">
          {hunkActions.staged
            ? hunkActions.onUnstage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  title="A hunk is this one contiguous block of changed lines — unstage just it, leaving the rest of the file's staged changes alone"
                  onClick={() => hunkActions.onUnstage?.(hunkIdx)}
                >
                  Unstage Hunk
                </Button>
              )
            : hunkActions.onStage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  title="A hunk is this one contiguous block of changed lines — stage just it, leaving the rest of the file unstaged"
                  onClick={() => hunkActions.onStage?.(hunkIdx)}
                >
                  Stage Hunk
                </Button>
              )}
          {!hunkActions.staged && hunkActions.onDiscard && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs hover:border-destructive hover:text-destructive"
              title="Permanently discard just this hunk's changes, leaving the rest of the file's edits intact"
              onClick={() => hunkActions.onDiscard?.(hunkIdx)}
            >
              Discard Hunk
            </Button>
          )}
        </span>
      )}
    </div>
  );
}

function UnifiedLine({
  line,
  hunkIdx,
  lineIdx,
  language,
  comments,
  onAddComment,
  onCopyPermalink,
  composerKey,
  setComposerKey,
}: {
  line: DiffLine;
  hunkIdx: number;
  lineIdx: number;
  language: string | undefined;
  comments: ReviewComment[] | undefined;
  onAddComment?: (line: number, side: "LEFT" | "RIGHT", body: string) => Promise<void> | void;
  onCopyPermalink?: (line: number) => void;
  composerKey: string | null;
  setComposerKey: (key: string | null) => void;
}) {
  const key = `${hunkIdx}:${lineIdx}`;
  const lineComments = commentsForLine(comments, line.old_lineno, line.new_lineno);
  const canComment = Boolean(onAddComment) && line.new_lineno != null;
  return (
    <div>
      <div
        className={cn(
          "group flex px-3 py-px whitespace-pre",
          line.kind === "addition" &&
            "bg-[color-mix(in_srgb,var(--accent-green)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-green)_18%,transparent)]",
          line.kind === "deletion" &&
            "bg-[color-mix(in_srgb,var(--accent-pink)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-pink)_18%,transparent)]",
          line.kind === "context" && "hover:bg-accent/40",
        )}
      >
        <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/60">
          {line.old_lineno ?? ""}
        </span>
        <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/60">
          {line.new_lineno ?? ""}
        </span>
        <span
          className={cn(
            "mr-2 shrink-0 select-none font-semibold",
            line.kind === "addition" && "text-accent-green",
            line.kind === "deletion" && "text-accent-pink",
          )}
        >
          {line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}
        </span>
        <span
          className="min-w-0 flex-1"
          dangerouslySetInnerHTML={{ __html: highlightLine(line.content, language) }}
        />
        {onCopyPermalink && line.new_lineno != null && (
          <button
            title="Copy GitHub permalink to this line"
            className="ml-2 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            onClick={() => onCopyPermalink(line.new_lineno as number)}
          >
            <LinkIcon className="size-3.5" />
          </button>
        )}
        {canComment && (
          <button
            title="Add comment"
            className="ml-2 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
            onClick={() => setComposerKey(composerKey === key ? null : key)}
          >
            <MessageSquarePlusIcon className="size-3.5" />
          </button>
        )}
      </div>
      <CommentThread comments={lineComments} />
      {composerKey === key && onAddComment && (
        <AddCommentComposer
          onCancel={() => setComposerKey(null)}
          onSubmit={(body) => onAddComment(line.new_lineno as number, "RIGHT", body)}
        />
      )}
    </div>
  );
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/** Structural (not LCS-aligned) pairing: context lines occupy both columns, deletions only
 * the left column, additions only the right — simple and correct, if not perfectly aligned
 * for large replaced blocks the way a full diff-alignment algorithm would be. */
function toSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const line of hunk.lines) {
    if (line.kind === "deletion") rows.push({ left: line, right: null });
    else if (line.kind === "addition") rows.push({ left: null, right: line });
    else rows.push({ left: line, right: line });
  }
  return rows;
}

function SplitCell({ line, language }: { line: DiffLine | null; language: string | undefined }) {
  if (!line) {
    return <div className="flex-1 bg-muted/30 px-3 py-px" />;
  }
  return (
    <div
      className={cn(
        "flex flex-1 px-3 py-px whitespace-pre",
        line.kind === "addition" &&
          "bg-[color-mix(in_srgb,var(--accent-green)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-green)_18%,transparent)]",
        line.kind === "deletion" &&
          "bg-[color-mix(in_srgb,var(--accent-pink)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent-pink)_18%,transparent)]",
        line.kind === "context" && "hover:bg-accent/40",
      )}
    >
      <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/60">
        {line.old_lineno ?? line.new_lineno ?? ""}
      </span>
      <span
        className={cn(
          "mr-2 shrink-0 select-none font-semibold",
          line.kind === "addition" && "text-accent-green",
          line.kind === "deletion" && "text-accent-pink",
        )}
      >
        {line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}
      </span>
      <span
        className="min-w-0 flex-1"
        dangerouslySetInnerHTML={{ __html: highlightLine(line.content, language) }}
      />
    </div>
  );
}

function DiffViewImpl({
  path,
  diff,
  imageDiff,
  comments,
  onAddComment,
  onCopyPermalink,
  hunkActions,
}: DiffViewProps) {
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const fontSize = useSettingsStore((s) => s.settings.diff_font_size);
  const diffViewMode = useSettingsStore((s) => s.settings.diff_view);
  const updateSettings = useSettingsStore((s) => s.update);
  const language = useMemo(() => (diff ? languageForPath(diff.path) : undefined), [diff]);

  const ViewToggle = (
    <button
      title={diffViewMode === "split" ? "Switch to unified view" : "Switch to split view"}
      className="text-muted-foreground hover:text-foreground"
      onClick={() => void updateSettings({ diff_view: diffViewMode === "split" ? "unified" : "split" })}
    >
      {diffViewMode === "split" ? <RowsIcon className="size-3.5" /> : <ColumnsIcon className="size-3.5" />}
    </button>
  );

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        Select a file to view its diff
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        Loading diff…
      </div>
    );
  }

  if (diff.is_image) {
    return <ImageDiffView path={diff.path} imageDiff={imageDiff ?? null} />;
  }

  if (diff.is_binary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 bg-dot-grid text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{diff.path}</span>
        <span>Binary file changed</span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  // Split view drops per-line comments/permalink/hunk-actions affordances — those stay
  // unified-only for now, split is a simpler read-focused layout.
  if (diffViewMode === "split") {
    return (
      <div className="h-full overflow-auto font-mono" style={{ fontSize: `${fontSize}px` }}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-3 py-1.5 text-xs font-medium">
          <span>{diff.path}</span>
          {ViewToggle}
        </div>
        {diff.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx}>
            <HunkHeader hunk={hunk} hunkIdx={hunkIdx} hunkActions={hunkActions} />
            {toSplitRows(hunk).map((row, rowIdx) => (
              <div key={rowIdx} className="flex">
                <SplitCell line={row.left} language={language} />
                <div className="w-px shrink-0 bg-border" />
                <SplitCell line={row.right} language={language} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto font-mono" style={{ fontSize: `${fontSize}px` }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-3 py-1.5 text-xs font-medium">
        <span>{diff.path}</span>
        {ViewToggle}
      </div>
      {diff.hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          <HunkHeader hunk={hunk} hunkIdx={hunkIdx} hunkActions={hunkActions} />
          {hunk.lines.map((line, lineIdx) => (
            <UnifiedLine
              key={lineIdx}
              line={line}
              hunkIdx={hunkIdx}
              lineIdx={lineIdx}
              language={language}
              comments={comments}
              onAddComment={onAddComment}
              onCopyPermalink={onCopyPermalink}
              composerKey={composerKey}
              setComposerKey={setComposerKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const DiffView = memo(DiffViewImpl);
