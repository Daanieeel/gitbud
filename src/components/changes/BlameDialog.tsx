import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import type { BlameLine } from "@/lib/types";

interface BlameDialogProps {
  repoPath: string;
  path: string | null;
  onOpenChange: (open: boolean) => void;
}

export function BlameDialog({ repoPath, path, onOpenChange }: BlameDialogProps) {
  const [lines, setLines] = useState<BlameLine[] | null>(null);
  const [content, setContent] = useState<string[]>([]);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const selectCommit = useRepoStore((s) => s.selectCommit);

  useEffect(() => {
    if (!path) return;
    setLines(null);
    void Promise.all([api.blameFile(repoPath, path), api.readWorkingFile(repoPath, path)]).then(
      ([blame, fileContent]) => {
        setLines(blame);
        setContent(fileContent.split("\n"));
      },
    );
  }, [repoPath, path]);

  const jumpToCommit = (oid: string) => {
    setActiveTab("history");
    void selectCommit(oid);
    onOpenChange(false);
  };

  return (
    <Dialog open={path != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{path}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border font-mono text-xs">
          {lines === null ? (
            <div className="p-4 text-center text-muted-foreground">Loading blame…</div>
          ) : (
            lines.map((line) => (
              <div key={line.line_no} className="flex hover:bg-accent">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="w-56 shrink-0 truncate border-r border-border px-2 py-0.5 text-left text-muted-foreground hover:text-foreground"
                      onClick={() => jumpToCommit(line.oid)}
                    >
                      {line.author_name} · {line.oid.slice(0, 7)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{`${line.summary}, click to view in History`}</TooltipContent>
                </Tooltip>
                <span className="mr-2 shrink-0 select-none px-1 text-muted-foreground/60">
                  {line.line_no}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre">{content[line.line_no - 1] ?? ""}</span>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
