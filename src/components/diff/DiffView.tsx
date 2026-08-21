import { memo, useState } from "react";
import { MessageSquarePlusIcon } from "lucide-react";
import type { FileDiff, ImageDiff, ReviewComment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ImageDiffView } from "./ImageDiffView";
import { Button } from "@/components/ui/button";

interface DiffViewProps {
  path: string | null;
  diff: FileDiff | null;
  imageDiff?: ImageDiff | null;
  comments?: ReviewComment[];
  onAddComment?: (line: number, side: "LEFT" | "RIGHT", body: string) => Promise<void> | void;
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
      <textarea
        autoFocus
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Leave a comment"
        className="w-full resize-none rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

function DiffViewImpl({ path, diff, imageDiff, comments, onAddComment }: DiffViewProps) {
  const [composerKey, setComposerKey] = useState<string | null>(null);

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a file to view its diff
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading diff…
      </div>
    );
  }

  if (diff.is_image) {
    return <ImageDiffView path={diff.path} imageDiff={imageDiff ?? null} />;
  }

  if (diff.is_binary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{diff.path}</span>
        <span>Binary file changed</span>
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto font-mono text-xs">
      <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-1.5 text-xs font-medium">
        {diff.path}
      </div>
      {diff.hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          <div className="bg-muted px-3 py-1 text-muted-foreground">{hunk.header}</div>
          {hunk.lines.map((line, lineIdx) => {
            const key = `${hunkIdx}:${lineIdx}`;
            const lineComments = commentsForLine(comments, line.old_lineno, line.new_lineno);
            const canComment = Boolean(onAddComment) && line.new_lineno != null;
            return (
              <div key={lineIdx}>
                <div
                  className={cn(
                    "group flex px-3 py-px whitespace-pre",
                    line.kind === "addition" && "bg-[var(--diff-add-bg)] text-[var(--diff-add-fg)]",
                    line.kind === "deletion" && "bg-[var(--diff-del-bg)] text-[var(--diff-del-fg)]",
                  )}
                >
                  <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/60">
                    {line.old_lineno ?? ""}
                  </span>
                  <span className="mr-3 inline-block w-8 shrink-0 select-none text-right text-muted-foreground/60">
                    {line.new_lineno ?? ""}
                  </span>
                  <span className="mr-2 shrink-0 select-none">
                    {line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}
                  </span>
                  <span className="min-w-0 flex-1">{line.content}</span>
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
          })}
        </div>
      ))}
    </div>
  );
}

export const DiffView = memo(DiffViewImpl);
