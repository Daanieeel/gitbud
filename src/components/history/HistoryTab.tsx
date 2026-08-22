import { useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";
import { CommitList } from "./CommitList";
import { CreateBranchAtDialog } from "./CreateBranchAtDialog";
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog";
import { DiffView } from "@/components/diff/DiffView";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";
import { FileTypeIcon } from "@/lib/file-icons";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";

const COMMIT_STATUS_DOT_COLOR: Record<string, string> = {
  Added: "bg-accent-green",
  Untracked: "bg-accent-green",
  Copied: "bg-accent-green",
  Modified: "bg-accent-green",
  Deleted: "bg-accent-pink",
  Renamed: "bg-muted-foreground",
  Typechange: "bg-muted-foreground",
  Conflicted: "bg-destructive",
};

export function HistoryTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const commits = useRepoStore((s) => s.commits);
  const selectedCommitOid = useRepoStore((s) => s.selectedCommitOid);
  const selectedCommitFiles = useRepoStore((s) => s.selectedCommitFiles);
  const selectedCommitFilePath = useRepoStore((s) => s.selectedCommitFilePath);
  const selectedCommitDiff = useRepoStore((s) => s.selectedCommitDiff);
  const selectedCommitImageDiff = useRepoStore((s) => s.selectedCommitImageDiff);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectCommitFile = useRepoStore((s) => s.selectCommitFile);
  const loadMoreHistory = useRepoStore((s) => s.loadMoreHistory);

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
      <div style={{ width: commitList.width }} className="shrink-0">
        <CommitList
          commits={commits}
          selectedOid={selectedCommitOid}
          onSelect={(oid) => void selectCommit(oid)}
          onNeedMore={() => void loadMoreHistory()}
          onCreateBranchHere={setBranchAtOid}
          onRebaseFromHere={setRebaseBaseOid}
        />
      </div>
      <ResizeHandle onPointerDown={commitList.onPointerDown} />
      <div style={{ width: fileList.width }} className="shrink-0 overflow-auto">
        {selectedCommitFiles.map(([path, status]) => (
          <div
            key={path}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 truncate px-2 py-1 text-sm hover:bg-accent",
              selectedCommitFilePath === path && "bg-accent",
            )}
            title={`${path} (${status})`}
            onClick={() => void selectCommitFile(path)}
          >
            <span className="relative shrink-0">
              <FileTypeIcon path={path} className="size-3.5" />
              <span
                className={cn(
                  "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background",
                  COMMIT_STATUS_DOT_COLOR[status] ?? "bg-muted-foreground",
                )}
              />
            </span>
            <span className="truncate">{path}</span>
          </div>
        ))}
      </div>
      <ResizeHandle onPointerDown={fileList.onPointerDown} />
      <div className="min-w-0 flex-1">
        <DiffView
          path={selectedCommitFilePath}
          diff={selectedCommitDiff}
          imageDiff={selectedCommitImageDiff}
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
      <CreateBranchAtDialog oid={branchAtOid} onOpenChange={(open) => !open && setBranchAtOid(null)} />
      <InteractiveRebaseDialog
        baseOid={rebaseBaseOid}
        onOpenChange={(open) => !open && setRebaseBaseOid(null)}
      />
    </div>
  );
}
