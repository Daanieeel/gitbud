import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepoStore } from "@/store/useRepoStore";
import { useCommitLog } from "@/hooks/queries/useCommitLog";
import { useCommitFileDiff, useCommitFiles } from "@/hooks/queries/useCommitDetail";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { queryKeys } from "@/lib/queryKeys";
import { toMainlineCommits } from "@/lib/compact-graph";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";
import { CommitHeader } from "./CommitHeader";
import { CommitList } from "./CommitList";
import { CommitSearchResults } from "./CommitSearchResults";
import { CreateBranchAtDialog } from "./CreateBranchAtDialog";
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog";
import { DiffView } from "@gitbud/ui/diff-view";
import { cn } from "@gitbud/ui/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";
import { api } from "@/lib/tauri";
import type { CommitSearchResult } from "@/lib/types";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { GenericFileMenuItems } from "@/components/changes/GenericFileMenuItems";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { Input } from "@gitbud/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@gitbud/ui/context-menu";

export function HistoryTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const selectedCommitOid = useRepoStore((s) => s.selectedCommitOid);
  const selectedCommitFilePath = useRepoStore((s) => s.selectedCommitFilePath);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectCommitFile = useRepoStore((s) => s.selectCommitFile);

  const { commits, fetchNextPage, hasNextPage, isFetchingNextPage } = useCommitLog(repoPath);
  const { data: selectedCommitFiles = [] } = useCommitFiles(repoPath, selectedCommitOid);
  const { data: selectedCommitFileDiff } = useCommitFileDiff(
    repoPath,
    selectedCommitOid,
    selectedCommitFilePath,
  );
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
  const [compact, setCompact] = useState(() => localStorage.getItem("history:compact") === "true");
  useEffect(() => {
    localStorage.setItem("history:compact", String(compact));
  }, [compact]);
  const displayedCommits = compact ? toMainlineCommits(commits) : commits;
  const commitFilePaths = useMemo(
    () => selectedCommitFiles.map(([path]) => path),
    [selectedCommitFiles],
  );
  const handleFileArrowNav = useArrowKeyFileNav(
    commitFilePaths,
    selectedCommitFilePath,
    selectCommitFile,
  );
  const fileListRef = useRef<HTMLDivElement>(null);
  const remoteInfo = useRemoteInfo(repoPath);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CommitSearchResult[]>([]);
  const isSearching = searchQuery.trim().length >= 2;

  useEffect(() => {
    if (!repoPath || !isSearching) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .searchCommits(repoPath, searchQuery.trim(), 200)
        .then((results) => !cancelled && setSearchResults(results));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [repoPath, searchQuery, isSearching]);

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div
        style={{ width: commitList.width }}
        className="flex shrink-0 flex-col border-r border-border"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
          <Input
            placeholder="Search by author, SHA, or message"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 flex-1"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <CheckboxGroup
                className="shrink-0 text-xs text-muted-foreground"
                checked={compact}
                onCheckedChange={(checked) => setCompact(checked === true)}
              >
                Compact
              </CheckboxGroup>
            </TooltipTrigger>
            <TooltipContent>
              Show only this branch's own history — merged-in branches collapse to a small bump at
              the merge commit instead of their own lane
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1">
          {isSearching ? (
            <CommitSearchResults
              results={searchResults}
              selectedOid={selectedCommitOid}
              onSelect={selectCommit}
              onCreateBranchHere={setBranchAtOid}
              onRebaseFromHere={setRebaseBaseOid}
            />
          ) : (
            <CommitList
              commits={displayedCommits}
              selectedOid={selectedCommitOid}
              onSelect={selectCommit}
              onNeedMore={() => hasNextPage && !isFetchingNextPage && void fetchNextPage()}
              onCreateBranchHere={setBranchAtOid}
              onRebaseFromHere={setRebaseBaseOid}
              compact={compact}
            />
          )}
        </div>
      </div>
      <ResizeHandle onPointerDown={commitList.onPointerDown} />
      <div className="flex min-w-0 flex-1 flex-col">
        {selectedCommitOid && <CommitHeader repoPath={repoPath} oid={selectedCommitOid} />}
        <div className="flex min-h-0 flex-1">
          <div
            ref={fileListRef}
            tabIndex={0}
            onKeyDown={handleFileArrowNav}
            style={{ width: fileList.width }}
            className="shrink-0 overflow-auto border-r border-border outline-none"
          >
            {selectedCommitFiles.map(([path, status]) => (
              <ContextMenu key={path}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ContextMenuTrigger asChild>
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
                    </ContextMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{`${path} (${status})`}</TooltipContent>
                </Tooltip>
                {repoPath && (
                  <ContextMenuContent>
                    <GenericFileMenuItems
                      repoPath={repoPath}
                      path={path}
                      providerRef={selectedCommitOid ?? undefined}
                      remoteInfo={remoteInfo}
                    />
                  </ContextMenuContent>
                )}
              </ContextMenu>
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
      <CreateBranchAtDialog
        oid={branchAtOid}
        onOpenChange={(open) => !open && setBranchAtOid(null)}
      />
      <InteractiveRebaseDialog
        baseOid={rebaseBaseOid}
        onOpenChange={(open) => !open && setRebaseBaseOid(null)}
      />
    </div>
  );
}
