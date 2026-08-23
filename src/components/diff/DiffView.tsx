import { memo, useMemo, useState } from "react";
import { ColumnsIcon, LinkIcon, MessageSquarePlusIcon, MinusIcon, PlusIcon, RowsIcon, Trash2Icon } from "lucide-react";
import type { DiffHunk, DiffLine, FileDiff, ImageDiff, LineKind, ReviewComment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImageDiffView } from "./ImageDiffView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/store/useSettingsStore";
import { applyHighlightRanges, highlightLine, languageForPath } from "@/lib/highlight";

interface HunkActions {
  /** Whether the diff being shown is the staged (HEAD->index) or unstaged (index->workdir) side. */
  staged: boolean;
  onStage?: (hunkIndex: number) => void;
  onUnstage?: (hunkIndex: number) => void;
  onDiscard?: (hunkIndex: number) => void;
  /** Line-level counterparts — each takes the indices (into that hunk's `lines[]`) of the
   * +/- line(s) to act on alone, leaving the rest of the hunk untouched. A modified line is a
   * delete+add pair under the hood, so staging "the whole line" means both indices; these are
   * plumbed through per-line so callers decide (e.g. one line at a time, from a hover button). */
  onStageLines?: (hunkIndex: number, lineIndices: number[]) => void;
  onUnstageLines?: (hunkIndex: number, lineIndices: number[]) => void;
  onDiscardLines?: (hunkIndex: number, lineIndices: number[]) => void;
}

interface DiffViewProps {
  path: string | null;
  diff: FileDiff | null;
  imageDiff?: ImageDiff | null;
  comments?: ReviewComment[];
  onAddComment?: (line: number, side: "LEFT" | "RIGHT", body: string) => Promise<void> | void;
  onCopyPermalink?: (line: number) => void;
  hunkActions?: HunkActions;
  /** The other side of the same file's changes (e.g. `diff` is unstaged, this is staged), shown
   * as its own labeled section below the primary one instead of requiring a toggle between the
   * two. Omitted entirely by read-only viewers (commit/PR/stash diffs) that only ever have one
   * side to show. */
  secondaryDiff?: FileDiff | null;
  secondaryHunkActions?: HunkActions;
}

const LINE_PREFIX: Record<LineKind, string> = {
  addition: "+",
  deletion: "-",
  context: " ",
};

/** Syntax-highlights a line, then overlays its intraline diff ranges (if any) on top so both
 * render together. */
function renderLineHtml(line: DiffLine, language: string | undefined): string {
  const html = highlightLine(line.content, language);
  if (line.highlight_ranges.length === 0) return html;
  const className = line.kind === "addition" ? "diff-intraline-add" : "diff-intraline-del";
  return applyHighlightRanges(html, line.highlight_ranges, className);
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
        <div key={c.id} className="flex items-start gap-1.5 text-xs">
          <Avatar src={c.user_avatar_url} alt={c.user_login} className="mt-0.5 size-4" />
          <div>
            <span className="font-medium">{c.user_login}</span>{" "}
            <span className="text-muted-foreground">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
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

function HunkHeader({ hunk, staged }: { hunk: DiffHunk; staged?: boolean }) {
  return (
    <div className="flex items-center gap-2 bg-muted px-3 py-1 text-muted-foreground">
      <span>{hunk.header}</span>
      {staged && (
        <span className="rounded-sm bg-accent-green/15 px-1 text-[10px] font-medium text-accent-green">
          staged
        </span>
      )}
    </div>
  );
}

function HunkActionsRow({
  hunkIdx,
  hunkActions,
  stickyTop,
}: {
  hunkIdx: number;
  hunkActions?: HunkActions;
  stickyTop: string;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (!hunkActions) return null;
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "sticky right-3 z-[8] flex gap-1.5 py-1.5 text-xs",
          stickyTop,
        )}
      >
        {hunkActions.staged
          ? hunkActions.onUnstage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    onClick={() => hunkActions.onUnstage?.(hunkIdx)}
                  >
                    Unstage
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Unstage just this chunk
                </TooltipContent>
              </Tooltip>
            )
          : hunkActions.onStage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    onClick={() => hunkActions.onStage?.(hunkIdx)}
                  >
                    Stage
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Stage just this chunk
                </TooltipContent>
              </Tooltip>
            )}
        {!hunkActions.staged && hunkActions.onDiscard && (
          <Popover open={confirmDiscard} onOpenChange={setConfirmDiscard}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs hover:border-destructive hover:text-destructive"
                  >
                    Discard
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Permanently discard just this chunk</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-56 space-y-2 p-3">
              <p className="text-sm">Permanently discard this chunk?</p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirmDiscard(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirmDiscard(false);
                    hunkActions.onDiscard?.(hunkIdx);
                  }}
                >
                  Discard
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
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
  hunkActions,
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
  hunkActions?: HunkActions;
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
          {LINE_PREFIX[line.kind]}
        </span>
        <span
          dangerouslySetInnerHTML={{ __html: renderLineHtml(line, language) }}
        />
        {(onCopyPermalink || canComment || (line.kind !== "context" && hunkActions)) && (
          // One sticky group for every trailing action, pinned to the right edge of the
          // scrollport — a whitespace-pre line can be far wider than the viewport, so without
          // this these buttons would sit off past the true end of the line, invisible unless
          // scrolled all the way over. A solid background keeps scrolling code text from
          // showing through underneath it.
          <div className="sticky right-3 z-[7] ml-auto flex shrink-0 items-center gap-1.5 rounded bg-card px-1.5 py-0.5 opacity-0 shadow-sm group-hover:opacity-100">
            {onCopyPermalink && line.new_lineno != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onCopyPermalink(line.new_lineno as number)}
                  >
                    <LinkIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy GitHub permalink to this line</TooltipContent>
              </Tooltip>
            )}
            {canComment && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setComposerKey(composerKey === key ? null : key)}
                  >
                    <MessageSquarePlusIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Add comment</TooltipContent>
              </Tooltip>
            )}
            {line.kind !== "context" && hunkActions && (
              <>
                {hunkActions.staged
                  ? hunkActions.onUnstageLines && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => hunkActions.onUnstageLines?.(hunkIdx, [lineIdx])}
                          >
                            <MinusIcon className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Unstage this line</TooltipContent>
                      </Tooltip>
                    )
                  : hunkActions.onStageLines && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => hunkActions.onStageLines?.(hunkIdx, [lineIdx])}
                          >
                            <PlusIcon className="size-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Stage this line</TooltipContent>
                      </Tooltip>
                    )}
                {!hunkActions.staged && hunkActions.onDiscardLines && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => hunkActions.onDiscardLines?.(hunkIdx, [lineIdx])}
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Discard this line</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
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
    return <div className="w-max min-w-[50%] bg-muted/30 px-3 py-px" />;
  }
  return (
    <div
      className={cn(
        "flex w-max min-w-[50%] px-3 py-px whitespace-pre",
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
        {LINE_PREFIX[line.kind]}
      </span>
      <span dangerouslySetInnerHTML={{ __html: renderLineHtml(line, language) }} />
    </div>
  );
}

interface DiffSectionProps {
  diff: FileDiff;
  hunkActions?: HunkActions;
  language: string | undefined;
  diffViewMode: "unified" | "split";
  label?: string;
  comments?: ReviewComment[];
  onAddComment?: (line: number, side: "LEFT" | "RIGHT", body: string) => Promise<void> | void;
  onCopyPermalink?: (line: number) => void;
  composerKey: string | null;
  setComposerKey: (key: string | null) => void;
}

/** One side's hunks (all of `diff`), optionally under its own "Staged changes"/"Unstaged
 * changes" label when rendered alongside the other side. Staged hunks get a green-tinted
 * wrapper and a small "staged" pill instead of the default blue tint, so both sides can be
 * visible together without being confused for each other. */
function DiffSection({
  diff,
  hunkActions,
  language,
  diffViewMode,
  label,
  comments,
  onAddComment,
  onCopyPermalink,
  composerKey,
  setComposerKey,
}: DiffSectionProps) {
  if (diff.hunks.length === 0) return null;
  const staged = hunkActions?.staged ?? false;
  const tint = staged ? "bg-accent-green/5" : "bg-accent-blue/5";
  // Clears the file-path header (sticky top-0) plus the "Staged/Unstaged changes" label
  // (sticky top-[29px]) when this section has one.
  const actionsStickyTop = label ? "top-[50px]" : "top-[29px]";

  return (
    <div>
      {label && (
        <div className="sticky top-[29px] z-[9] bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
          {label}
        </div>
      )}
      {diff.hunks.map((hunk, hunkIdx) =>
        diffViewMode === "split" ? (
          <div key={hunkIdx}>
            <HunkHeader hunk={hunk} staged={staged} />
            <div className={tint}>
              <HunkActionsRow hunkIdx={hunkIdx} hunkActions={hunkActions} stickyTop={actionsStickyTop} />
              {toSplitRows(hunk).map((row, rowIdx) => (
                <div key={rowIdx} className="flex">
                  <SplitCell line={row.left} language={language} />
                  <div className="w-px shrink-0 bg-border" />
                  <SplitCell line={row.right} language={language} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key={hunkIdx}>
            <HunkHeader hunk={hunk} staged={staged} />
            <div className={tint}>
              <HunkActionsRow hunkIdx={hunkIdx} hunkActions={hunkActions} stickyTop={actionsStickyTop} />
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
                  hunkActions={hunkActions}
                  composerKey={composerKey}
                  setComposerKey={setComposerKey}
                />
              ))}
            </div>
          </div>
        ),
      )}
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
  secondaryDiff,
  secondaryHunkActions,
}: DiffViewProps) {
  const [composerKey, setComposerKey] = useState<string | null>(null);
  const fontSize = useSettingsStore((s) => s.settings.diff_font_size);
  const diffViewMode = useSettingsStore((s) => s.settings.diff_view);
  const updateSettings = useSettingsStore((s) => s.update);
  const language = useMemo(() => (diff ? languageForPath(diff.path) : undefined), [diff]);

  const ViewToggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void updateSettings({ diff_view: diffViewMode === "split" ? "unified" : "split" })}
        >
          {diffViewMode === "split" ? <RowsIcon className="size-3.5" /> : <ColumnsIcon className="size-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{diffViewMode === "split" ? "Switch to unified view" : "Switch to split view"}</TooltipContent>
    </Tooltip>
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

  const showSecondary = secondaryDiff !== undefined;
  const totalHunks = diff.hunks.length + (secondaryDiff?.hunks.length ?? 0);
  if (totalHunks === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto font-mono" style={{ fontSize: `${fontSize}px` }}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-3 py-1.5 text-xs font-medium">
        <span>{diff.path}</span>
        {ViewToggle}
      </div>
      <div className="w-max min-w-full">
        <DiffSection
          diff={diff}
          hunkActions={hunkActions}
          language={language}
          diffViewMode={diffViewMode}
          label={showSecondary ? (hunkActions?.staged ? "Staged changes" : "Unstaged changes") : undefined}
          comments={comments}
          onAddComment={onAddComment}
          onCopyPermalink={onCopyPermalink}
          composerKey={composerKey}
          setComposerKey={setComposerKey}
        />
        {secondaryDiff && (
          <DiffSection
            diff={secondaryDiff}
            hunkActions={secondaryHunkActions}
            language={language}
            diffViewMode={diffViewMode}
            label={secondaryHunkActions?.staged ? "Staged changes" : "Unstaged changes"}
            comments={comments}
            onAddComment={onAddComment}
            onCopyPermalink={onCopyPermalink}
            composerKey={composerKey}
            setComposerKey={setComposerKey}
          />
        )}
      </div>
    </div>
  );
}

export const DiffView = memo(DiffViewImpl);
