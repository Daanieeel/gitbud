import { useEffect, useMemo, useRef, useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";
import { useStatus, useDiscardFiles, useStageHunk, useToggleStaged, useUnstageHunk, useDiscardHunk } from "@/hooks/queries/useRepoStatus";
import { useFileDiff } from "@/hooks/queries/useFileDiff";
import { FileList } from "./FileList";
import { ConflictResolutionPanel } from "./ConflictResolutionPanel";
import { DiffView } from "@/components/diff/DiffView";
import { CommitBox } from "@/components/commit/CommitBox";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";

export function ChangesTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const selectedFilePath = useRepoStore((s) => s.selectedFilePath);
  const selectFile = useRepoStore((s) => s.selectFile);

  const { data: status } = useStatus(repoPath);
  const files = status?.files ?? null;
  const entryStaged = files?.find((f) => f.path === selectedFilePath)?.staged ?? false;
  const { data: fileDiff } = useFileDiff(repoPath, selectedFilePath, entryStaged);

  const toggleStagedMutation = useToggleStaged(repoPath);
  const discardFilesMutation = useDiscardFiles(repoPath);
  const stageHunkMutation = useStageHunk(repoPath);
  const unstageHunkMutation = useUnstageHunk(repoPath);
  const discardHunkMutation = useDiscardHunk(repoPath);

  const [filter, setFilter] = useState("");
  const { width, onPointerDown } = useResizableWidth("panel-width:changes-files", 288, 200, 560);

  // A file the user has selected can disappear out from under them — committed, discarded, or
  // fully unstaged into nothing left to show — in which case there's nothing left to display.
  useEffect(() => {
    if (files && selectedFilePath && !files.some((f) => f.path === selectedFilePath)) {
      selectFile(null);
    }
  }, [files, selectedFilePath, selectFile]);

  const filtered = useMemo(() => {
    if (!files) return [];
    if (!filter.trim()) return files;
    const needle = filter.toLowerCase();
    return files.filter((f) => f.path.toLowerCase().includes(needle));
  }, [files, filter]);

  const filePaths = useMemo(() => filtered.map((f) => f.path), [filtered]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedFilePath, selectFile);
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fileListRef.current?.focus();
  }, []);

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
      <div style={{ width }} className="flex shrink-0 flex-col border-r border-border">
        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No local changes
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Checkbox
                    checked={allStaged}
                    onCheckedChange={(checked) =>
                      toggleStagedMutation.mutate({ paths: filtered.map((f) => f.path), staged: checked === true })
                    }
                  />
                </TooltipTrigger>
                <TooltipContent>{allStaged ? "Unstage all" : "Stage all"}</TooltipContent>
              </Tooltip>
              <Input
                placeholder="Filter files"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8"
              />
            </div>
            <div ref={fileListRef} tabIndex={0} onKeyDown={handleArrowNav} className="min-h-0 flex-1 outline-none">
              <FileList
                files={filtered}
                selectedPath={selectedFilePath}
                onSelect={selectFile}
                onToggle={(path, staged) => toggleStagedMutation.mutate({ paths: [path], staged })}
                onToggleMany={(paths, staged) => toggleStagedMutation.mutate({ paths, staged })}
                onDiscardMany={(paths) => discardFilesMutation.mutate(paths)}
              />
            </div>
          </>
        )}
        <CommitBox />
      </div>
      <ResizeHandle onPointerDown={onPointerDown} />
      <div className="min-w-0 flex-1">
        {selectedFilePath &&
        repoPath &&
        files.find((f) => f.path === selectedFilePath)?.status === "conflicted" ? (
          <ConflictResolutionPanel repoPath={repoPath} path={selectedFilePath} />
        ) : (
          <DiffView
            path={selectedFilePath}
            diff={fileDiff?.unstaged ?? null}
            secondaryDiff={fileDiff?.staged ?? null}
            imageDiff={fileDiff?.imageDiff ?? null}
            hunkActions={
              selectedFilePath
                ? {
                    staged: false,
                    onStage: (i) => stageHunkMutation.mutate({ path: selectedFilePath, hunkIndex: i }),
                    onDiscard: (i) => discardHunkMutation.mutate({ path: selectedFilePath, hunkIndex: i }),
                  }
                : undefined
            }
            secondaryHunkActions={
              selectedFilePath
                ? {
                    staged: true,
                    onUnstage: (i) => unstageHunkMutation.mutate({ path: selectedFilePath, hunkIndex: i }),
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
