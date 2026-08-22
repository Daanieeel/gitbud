import { useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";
import { CommitList } from "./CommitList";
import { CreateBranchAtDialog } from "./CreateBranchAtDialog";
import { InteractiveRebaseDialog } from "./InteractiveRebaseDialog";
import { DiffView } from "@/components/diff/DiffView";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";

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

  if (commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="w-72 shrink-0 border-r border-border">
        <CommitList
          commits={commits}
          selectedOid={selectedCommitOid}
          onSelect={(oid) => void selectCommit(oid)}
          onNeedMore={() => void loadMoreHistory()}
          onCreateBranchHere={setBranchAtOid}
          onRebaseFromHere={setRebaseBaseOid}
        />
      </div>
      <div className="w-56 shrink-0 border-r border-border overflow-auto">
        {selectedCommitFiles.map(([path, status]) => (
          <div
            key={path}
            className={cn(
              "cursor-pointer truncate px-2 py-1 text-sm hover:bg-accent",
              selectedCommitFilePath === path && "bg-accent",
            )}
            title={`${path} (${status})`}
            onClick={() => void selectCommitFile(path)}
          >
            {path}
          </div>
        ))}
      </div>
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
