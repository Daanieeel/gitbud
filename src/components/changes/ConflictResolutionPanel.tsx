import { useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";

interface ConflictResolutionPanelProps {
  repoPath: string;
  path: string;
}

export function ConflictResolutionPanel({ repoPath, path }: ConflictResolutionPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const toggleStaged = useRepoStore((s) => s.toggleStaged);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    void api.readWorkingFile(repoPath, path).then(
      (c) => !cancelled && setContent(c),
      () => !cancelled && setContent(""),
    );
    return () => {
      cancelled = true;
    };
  }, [repoPath, path]);

  const useSide = async (side: "ours" | "theirs") => {
    setResolving(true);
    try {
      await api.resolveConflict(repoPath, path, side);
      await refreshStatus();
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
        <span className="mr-2 truncate text-sm font-medium text-destructive">{path} — conflicted</span>
        <Button size="sm" variant="outline" disabled={resolving} onClick={() => void useSide("ours")}>
          Use Mine
        </Button>
        <Button size="sm" variant="outline" disabled={resolving} onClick={() => void useSide("theirs")}>
          Use Theirs
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void openPath(`${repoPath}/${path}`)}
        >
          Edit Manually
        </Button>
        <Button size="sm" disabled={resolving || hasMarkers} onClick={() => void markResolved()}>
          Mark Resolved
        </Button>
        {hasMarkers && (
          <span className="text-xs text-muted-foreground">
            Conflict markers still present — resolve them before marking as resolved.
          </span>
        )}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">
        {content ?? "Loading…"}
      </pre>
    </div>
  );
}
