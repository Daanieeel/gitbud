import { useMemo, useState } from "react";
import { useRepoStore } from "@/store/useRepoStore";
import { FileList } from "./FileList";
import { DiffView } from "@/components/diff/DiffView";
import { CommitBox } from "@/components/commit/CommitBox";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export function ChangesTab() {
  const files = useRepoStore((s) => s.status?.files ?? null);
  const selectedFilePath = useRepoStore((s) => s.selectedFilePath);
  const selectedFileDiff = useRepoStore((s) => s.selectedFileDiff);
  const branch = useRepoStore((s) => s.branch);
  const selectFile = useRepoStore((s) => s.selectFile);
  const toggleStaged = useRepoStore((s) => s.toggleStaged);
  const doCommit = useRepoStore((s) => s.doCommit);

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
  const hasStagedChanges = files.some((f) => f.staged);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        {files.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No local changes
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
              <Checkbox
                checked={allStaged}
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
        <CommitBox
          branch={branch}
          hasStagedChanges={hasStagedChanges}
          onCommit={(summary, description) => doCommit(summary, description)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <DiffView path={selectedFilePath} diff={selectedFileDiff} />
      </div>
    </div>
  );
}
