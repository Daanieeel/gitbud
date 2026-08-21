import { useRepoStore } from "@/store/useRepoStore";
import { CommitList } from "./CommitList";
import { DiffView } from "@/components/diff/DiffView";
import { cn } from "@/lib/utils";

export function HistoryTab() {
  const commits = useRepoStore((s) => s.commits);
  const selectedCommitOid = useRepoStore((s) => s.selectedCommitOid);
  const selectedCommitFiles = useRepoStore((s) => s.selectedCommitFiles);
  const selectedCommitFilePath = useRepoStore((s) => s.selectedCommitFilePath);
  const selectedCommitDiff = useRepoStore((s) => s.selectedCommitDiff);
  const selectedCommitImageDiff = useRepoStore((s) => s.selectedCommitImageDiff);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectCommitFile = useRepoStore((s) => s.selectCommitFile);
  const loadMoreHistory = useRepoStore((s) => s.loadMoreHistory);

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
        />
      </div>
    </div>
  );
}
