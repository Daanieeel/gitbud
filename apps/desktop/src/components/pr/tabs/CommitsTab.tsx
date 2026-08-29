import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Avatar } from "@gitbud/ui/avatar";
import { DiffView } from "@gitbud/ui/diff-view";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { usePullRequestCommits, useCommitDiffFiles } from "@/hooks/queries/usePRCommits";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { cn } from "@gitbud/ui/utils";
import type { PullRequest } from "@/lib/types";

interface CommitsTabProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const MAX_COMMITS_PER_PAGE = 100;

export function CommitsTab({ repoPath, login, pr }: CommitsTabProps) {
  const { data: commits = [], isLoading } = usePullRequestCommits(
    repoPath,
    login,
    pr.number,
    pr.head_sha,
  );
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: commitFiles = [] } = useCommitDiffFiles(repoPath, login, selectedSha);
  const { width: commitsWidth, onPointerDown: onCommitsResize } = useResizableWidth(
    "panel-width:pr-commits",
    280,
    200,
    480,
  );

  useEffect(() => {
    if (commits.length > 0 && selectedSha === null) setSelectedSha(commits[0].sha);
  }, [commits, selectedSha]);

  useEffect(() => {
    setSelectedPath(null);
  }, [selectedSha]);

  useEffect(() => {
    if (commitFiles.length > 0 && selectedPath === null) setSelectedPath(commitFiles[0].filename);
  }, [commitFiles, selectedPath]);

  const selectedFile = commitFiles.find((f) => f.filename === selectedPath);

  if (!isLoading && commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No commits
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div
        style={{ width: commitsWidth }}
        className="shrink-0 overflow-auto border-r border-border"
      >
        {commits.length === MAX_COMMITS_PER_PAGE && (
          <div className="border-b border-border p-2 text-xs text-muted-foreground">
            Showing the first {MAX_COMMITS_PER_PAGE} commits —{" "}
            <a
              href="#"
              className="underline hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                void openUrl(pr.html_url);
              }}
            >
              view all on GitHub
            </a>
            .
          </div>
        )}
        {commits.map((c) => (
          <div
            key={c.sha}
            onClick={() => setSelectedSha(c.sha)}
            className={cn(
              "flex cursor-pointer flex-col gap-0.5 border-b border-border/50 px-2 py-1.5 text-sm hover:bg-accent",
              selectedSha === c.sha && "bg-accent",
            )}
          >
            <span className="truncate font-medium">{c.summary}</span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {c.author_avatar_url && (
                <Avatar src={c.author_avatar_url} alt={c.author_login ?? ""} className="size-3.5" />
              )}
              <span className="truncate">{c.author_login ?? c.author_name ?? "unknown"}</span>
              {c.authored_at && (
                <span className="shrink-0">
                  {formatDistanceToNow(new Date(c.authored_at), { addSuffix: true })}
                </span>
              )}
              <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-secondary-foreground">
                {c.sha.slice(0, 7)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <ResizeHandle onPointerDown={onCommitsResize} />
      <div className="w-48 shrink-0 overflow-auto border-r border-border">
        {commitFiles.map((f) => (
          <Tooltip key={f.filename}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 px-2 py-1 text-sm hover:bg-accent",
                  selectedPath === f.filename && "bg-accent",
                )}
                onClick={() => setSelectedPath(f.filename)}
              >
                <FileTypeIcon path={f.filename} className="size-3.5 shrink-0" />
                <FilePathLabel path={f.filename} />
                <FileStatusIcon status={f.status} className="size-3.5" />
              </div>
            </TooltipTrigger>
            <TooltipContent>{`${f.filename} (${f.status})`}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <DiffView path={selectedPath} diff={selectedFile?.diff ?? null} />
      </div>
    </div>
  );
}
