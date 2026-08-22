import { useMemo, useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";
import { FileList } from "./FileList";
import { StashPanel } from "./StashPanel";
import { ConflictResolutionPanel } from "./ConflictResolutionPanel";
import { DiffView } from "@/components/diff/DiffView";
import { CommitBox } from "@/components/commit/CommitBox";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function ChangesTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const files = useRepoStore((s) => s.status?.files ?? null);
  const selectedFilePath = useRepoStore((s) => s.selectedFilePath);
  const selectedFileDiff = useRepoStore((s) => s.selectedFileDiff);
  const selectedFileImageDiff = useRepoStore((s) => s.selectedFileImageDiff);
  const selectFile = useRepoStore((s) => s.selectFile);
  const toggleStaged = useRepoStore((s) => s.toggleStaged);
  const stageHunk = useRepoStore((s) => s.stageHunk);
  const unstageHunk = useRepoStore((s) => s.unstageHunk);
  const discardHunk = useRepoStore((s) => s.discardHunk);

  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!files) return [];
    if (!filter.trim()) return files;
    const needle = filter.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(needle));
  }, [files, filter]);

  if (files === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const allStaged = filtered.length > 0 && filtered.every((f) => f.staged);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center justify-end border-b border-border p-2">
          <StashPanel hasChanges={files.length > 0} />
        </div>
        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No local changes
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
              <Checkbox
                checked={allStaged}
                title={allStaged ? "Unstage all" : "Stage all"}
                onCheckedChange={(checked) =>
                  void toggleStaged(filtered.map((f) => f.path), checked === true)
                }
              />
              <Input
                placeholder="Filter files"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7"
              />
            </div>
            <div className="min-h-0 flex-1">
              <FileList
                files={filtered}
                selectedPath={selectedFilePath}
                onSelect={(path) => void selectFile(path)}
                onToggle={(path, staged) => void toggleStaged([path], staged)}
              />
            </div>
          </>
        )}
        <CommitBox />
      </div>
      <div className="min-w-0 flex-1">
        {selectedFilePath &&
        repoPath &&
        files.find((f) => f.path === selectedFilePath)?.status === "conflicted" ? (
          <ConflictResolutionPanel repoPath={repoPath} path={selectedFilePath} />
        ) : (
          <DiffView
            path={selectedFilePath}
            diff={selectedFileDiff}
            imageDiff={selectedFileImageDiff}
            hunkActions={
              selectedFilePath
                ? {
                    staged: files.find((f) => f.path === selectedFilePath)?.staged ?? false,
                    onStage: (i) => void stageHunk(selectedFilePath, i),
                    onUnstage: (i) => void unstageHunk(selectedFilePath, i),
                    onDiscard: (i) => void discardHunk(selectedFilePath, i),
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
