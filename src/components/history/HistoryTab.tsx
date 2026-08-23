import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoStore } from "@/store/useRepoStore";
import { useCommitLog } from "@/hooks/queries/useCommitLog";
import { useCommitFileDiff, useCommitFiles } from "@/hooks/queries/useCommitDetail";
import { queryKeys } from "@/lib/queryKeys";
import { CommitHeader } from "./CommitHeader";
import { CommitList } from "./CommitList";
import { CreateBranchAtDialog } from "./CreateBranchAtDialog";
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog";
import { DiffView } from "@/components/diff/DiffView";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HistoryTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const selectedCommitOid = useRepoStore((s) => s.selectedCommitOid);
  const selectedCommitFilePath = useRepoStore((s) => s.selectedCommitFilePath);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectCommitFile = useRepoStore((s) => s.selectCommitFile);

  const { commits, fetchNextPage, hasNextPage, isFetchingNextPage } = useCommitLog(repoPath);
  const { data: selectedCommitFiles = [] } = useCommitFiles(repoPath, selectedCommitOid);
  const { data: selectedCommitFileDiff } = useCommitFileDiff(repoPath, selectedCommitOid, selectedCommitFilePath);
  const queryClient = useQueryClient();

  // This tab only exists in the tree while it's the active one (App.tsx conditionally renders
  // it), so this mount effect fires exactly once per switch into History — a cheap, local,
  // no-network-cost refresh that matches "entering a tab re-fetches" without needing to poll.
  useEffect(() => {
    if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to the first changed file whenever a different commit is selected (or its file list
  // just loaded), mirroring the old eager auto-select — but only while nothing's picked yet, so
  // it doesn't fight the user's own file selection.
  useEffect(() => {
    if (selectedCommitOid && selectedCommitFilePath === null && selectedCommitFiles.length > 0) {
      selectCommitFile(selectedCommitFiles[0][0]);
    }
  }, [selectedCommitOid, selectedCommitFilePath, selectedCommitFiles, selectCommitFile]);

  const [branchAtOid, setBranchAtOid] = useState<string | null>(null);
  const [rebaseBaseOid, setRebaseBaseOid] = useState<string | null>(null);
  const commitList = useResizableWidth("panel-width:history-commits", 288, 200, 560);
  const fileList = useResizableWidth("panel-width:history-files", 224, 160, 480);

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div style={{ width: commitList.width }} className="shrink-0 border-r border-border">
        <CommitList
          commits={commits}
          selectedOid={selectedCommitOid}
          onSelect={selectCommit}
          onNeedMore={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
          onCreateBranchHere={setBranchAtOid}
          onRebaseFromHere={setRebaseBaseOid}
        />
      </div>
      <ResizeHandle onPointerDown={commitList.onPointerDown} />
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedCommitOid && <CommitHeader repoPath={repoPath} oid={selectedCommitOid} />}
        <div className="flex min-h-0 flex-1">
          <div style={{ width: fileList.width }} className="shrink-0 overflow-auto border-r border-border">
            {selectedCommitFiles.map(([path, status]) => (
              <Tooltip key={path}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "flex h-7 items-center gap-2 px-2 text-sm cursor-pointer select-none hover:bg-accent",
                      selectedCommitFilePath === path && "bg-accent",
                    )}
                    onClick={() => selectCommitFile(path)}
                  >
                    <FileTypeIcon path={path} className="size-3.5 shrink-0" />
                    <FilePathLabel path={path} />
                    <FileStatusIcon status={status} className="size-3.5" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>{`${path} (${status})`}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <ResizeHandle onPointerDown={fileList.onPointerDown} />
          <div className="min-w-0 flex-1">
            <DiffView
              path={selectedCommitFilePath}
              diff={selectedCommitFileDiff?.diff ?? null}
              imageDiff={selectedCommitFileDiff?.imageDiff ?? null}
              onCopyPermalink={(line) => {
                if (!repoPath || !selectedCommitOid || !selectedCommitFilePath) return;
                void githubFileUrl(repoPath, selectedCommitOid, selectedCommitFilePath, line).then(
                  (url) => {
                    if (url) void copyToClipboard(url);
                  },
                );
              }}
            />
          </div>
        </div>
      </div>
      <CreateBranchAtDialog oid={branchAtOid} onOpenChange={(open) => !open && setBranchAtOid(null)} />
      <InteractiveRebaseDialog
        baseOid={rebaseBaseOid}
        onOpenChange={(open) => !open && setRebaseBaseOid(null)}
      />
    </div>
  );
}
