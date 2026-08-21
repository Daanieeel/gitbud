import { memo } from "react";
import type { FileDiff } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  path: string | null;
  diff: FileDiff | null;
}

function DiffViewImpl({ path, diff }: DiffViewProps) {
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
          {hunk.lines.map((line, lineIdx) => (
            <div
              key={lineIdx}
              className={cn(
                "flex px-3 py-px whitespace-pre",
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
              <span>{line.content}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export const DiffView = memo(DiffViewImpl);
