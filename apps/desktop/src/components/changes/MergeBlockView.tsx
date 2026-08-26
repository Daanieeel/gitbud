import { Button } from "@gitbud/ui/button";
import { cn } from "@gitbud/ui/utils";
import {
  blockBaseLines,
  hunkSideLinesForDisplay,
  isConflictBlock,
  type MergeBlock,
  type Pick,
} from "@/lib/merge3";
import type { ConflictSides } from "@/lib/types";

function Column({ label, lines, tone }: { label: string; lines: string[]; tone: string }) {
  return (
    <div className="min-w-0">
      <div className={cn("mb-1 text-[10px] font-medium uppercase", tone)}>{label}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-muted/40 p-1.5 font-mono text-xs">
        {lines.length > 0 ? lines.join("\n") : "(empty)"}
      </pre>
    </div>
  );
}

interface MergeBlockViewProps {
  sides: ConflictSides;
  block: MergeBlock;
  pick: Pick | null;
  onPick: (pick: Pick) => void;
}

export function MergeBlockView({ sides, block, pick, onPick }: MergeBlockViewProps) {
  const conflict = isConflictBlock(block);
  const effectivePick = pick ?? (conflict ? null : block.oursHunk ? "ours" : "theirs");

  return (
    <div className={cn("border-b border-border p-2", conflict && "bg-destructive/5")}>
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          Base lines {block.baseStart}
          {block.baseEnd !== block.baseStart ? ` to ${block.baseEnd}` : ""}
        </span>
        {conflict ? (
          <span className="font-medium text-destructive">conflict, pick one</span>
        ) : (
          <span className="text-muted-foreground">
            only changed by {block.oursHunk ? "you" : "them"}, kept automatically
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Column label="Base" lines={blockBaseLines(sides, block)} tone="text-muted-foreground" />
        <Column
          label="Mine"
          lines={hunkSideLinesForDisplay(block.oursHunk)}
          tone="text-accent-green"
        />
        <Column
          label="Theirs"
          lines={hunkSideLinesForDisplay(block.theirsHunk)}
          tone="text-accent-yellow"
        />
      </div>
      <div className="mt-1.5 flex gap-1">
        <Button
          size="sm"
          variant={effectivePick === "base" ? "default" : "outline"}
          onClick={() => onPick("base")}
        >
          Use Base
        </Button>
        <Button
          size="sm"
          variant={effectivePick === "ours" ? "default" : "outline"}
          disabled={!block.oursHunk}
          onClick={() => onPick("ours")}
        >
          Use Mine
        </Button>
        <Button
          size="sm"
          variant={effectivePick === "theirs" ? "default" : "outline"}
          disabled={!block.theirsHunk}
          onClick={() => onPick("theirs")}
        >
          Use Theirs
        </Button>
      </div>
    </div>
  );
}
