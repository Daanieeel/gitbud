import { useEffect, useMemo, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { CheckIcon, PencilIcon, UserIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { buildMergeBlocks, reconstructFile, type Pick } from "@/lib/merge3";
import type { ConflictSides } from "@/lib/types";
import { MergeBlockView } from "./MergeBlockView";
import { cn } from "@/lib/utils";

interface ConflictResolutionPanelProps {
  repoPath: string;
  path: string;
}

export function ConflictResolutionPanel({ repoPath, path }: ConflictResolutionPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [sides, setSides] = useState<ConflictSides | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [view, setView] = useState<"merge" | "raw">("merge");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleStaged = useRepoStore((s) => s.toggleStaged);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setSides(null);
    setPicks({});
    setError(null);
    void api.readWorkingFile(repoPath, path).then(
      (c) => !cancelled && setContent(c),
      () => !cancelled && setContent(""),
    );
    void api.getConflictSides(repoPath, path).then(
      (s) => !cancelled && setSides(s),
      () => !cancelled && setSides(null),
    );
    return () => {
      cancelled = true;
    };
  }, [repoPath, path]);

  const blocks = useMemo(() => (sides ? buildMergeBlocks(sides) : []), [sides]);
  const conflictBlocks = blocks.filter((b) => b.oursHunk && b.theirsHunk);
  const allPicked = conflictBlocks.every((b) => picks[b.id] != null);

  const useSide = async (side: "ours" | "theirs") => {
    setResolving(true);
    try {
      await api.resolveConflict(repoPath, path, side);
      await refreshStatus();
    } finally {
      setResolving(false);
    }
  };

  const saveMergeResolution = async () => {
    if (!sides) return;
    setResolving(true);
    setError(null);
    try {
      const merged = reconstructFile(sides, blocks, picks);
      await api.resolveConflictWithContent(repoPath, path, merged);
      await refreshStatus();
    } catch (e) {
      setError(String(e));
    } finally {
      setResolving(false);
    }
  };

  const markResolved = async () => {
    setResolving(true);
    try {
      await toggleStaged([path], true);
    } finally {
      setResolving(false);
    }
  };

  const hasMarkers = content?.includes("<<<<<<<") ?? false;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <span className="mr-2 truncate text-sm font-medium text-destructive">{path}, conflicted</span>
        <div className="flex rounded-md border border-input p-0.5 text-xs">
          <button
            className={cn("rounded-sm px-2 py-0.5", view === "merge" && "bg-accent")}
            onClick={() => setView("merge")}
          >
            3-way merge
          </button>
          <button
            className={cn("rounded-sm px-2 py-0.5", view === "raw" && "bg-accent")}
            onClick={() => setView("raw")}
          >
            Raw
          </button>
        </div>
        <Button size="sm" variant="secondary" disabled={resolving} onClick={() => void useSide("ours")}>
          <UserIcon className="size-3.5" />
          Use Mine (whole file)
        </Button>
        <Button size="sm" variant="secondary" disabled={resolving} onClick={() => void useSide("theirs")}>
          <UsersIcon className="size-3.5" />
          Use Theirs (whole file)
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void openPath(`${repoPath}/${path}`)}>
          <PencilIcon className="size-3.5" />
          Edit Manually
        </Button>
        <Button size="sm" disabled={resolving || hasMarkers} onClick={() => void markResolved()}>
          <CheckIcon className="size-3.5" />
          Mark Resolved
        </Button>
        {hasMarkers && (
          <span className="text-xs text-muted-foreground">
            Conflict markers still present. Resolve them before marking as resolved.
          </span>
        )}
      </div>
      {view === "raw" || !sides ? (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">
          {content ?? "Loading…"}
        </pre>
      ) : blocks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No line-level differences found vs. the common ancestor. Use one of the whole-file
          actions above, or switch to Raw.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {blocks.map((block) => (
            <MergeBlockView
              key={block.id}
              sides={sides}
              block={block}
              pick={picks[block.id] ?? null}
              onPick={(pick) => setPicks((p) => ({ ...p, [block.id]: pick }))}
            />
          ))}
          <div className="flex items-center gap-2 p-2">
            <Button size="sm" disabled={!allPicked || resolving} onClick={() => void saveMergeResolution()}>
              <CheckIcon className="size-3.5" />
              Save Resolution
            </Button>
            {!allPicked && (
              <span className="text-xs text-muted-foreground">
                Pick a side for every conflicting block above ({conflictBlocks.length} left).
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
