import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ShieldCheckIcon } from "lucide-react";
import { Avatar } from "@gitbud/ui/avatar";
import { CopyButton } from "@gitbud/ui/copy-button";
import { DiffView } from "@gitbud/ui/diff-view";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { usePullRequestCommits, useCommitDiffFiles } from "@/hooks/queries/usePRCommits";
import { CIBadge } from "../CIBadge";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { diffStats } from "@/lib/diffStats";
import { api } from "@/lib/tauri";
import { cn } from "@gitbud/ui/utils";
import type { PullRequest, PullRequestCommit } from "@/lib/types";

interface CommitsTabProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const MAX_COMMITS_PER_PAGE = 100;

/** Same idea as History's private `VerificationBadge` (`CommitList.tsx`), just against a PR
 * commit's sha instead of a local `CommitEntry`'s — the two views have no shared row component
 * to reuse, only the same underlying `githubGetCommitVerification` call. */
function PRCommitVerificationBadge({
  repoPath,
  login,
  sha,
}: {
  repoPath: string;
  login: string;
  sha: string;
}) {
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.githubGetCommitVerification(repoPath, login, sha).then(
      (v) => !cancelled && setVerified(v.verified),
      () => !cancelled && setVerified(null),
    );
    return () => {
      cancelled = true;
    };
  }, [repoPath, login, sha]);

  if (!verified) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <ShieldCheckIcon className="size-3 shrink-0 text-accent-green" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Verified signature</TooltipContent>
    </Tooltip>
  );
}

/** Sits above the file list + diff, mirroring History's `CommitHeader`: full message, author,
 * date, a copiable sha, and the diffstat — computed from `commitFiles` since GitHub's PR-commits
 * API (unlike local `CommitDetail`) returns no precomputed insertions/deletions. */
function PRCommitHeader({
  commit,
  filesChanged,
  insertions,
  deletions,
}: {
  commit: PullRequestCommit;
  filesChanged: number;
  insertions: number;
  deletions: number;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2.5">
      <span className="truncate text-sm font-medium">{commit.summary}</span>
      {commit.body && (
        <p className="max-h-[200px] overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
          {commit.body}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {commit.author_avatar_url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Avatar
                    src={commit.author_avatar_url}
                    alt={commit.author_login ?? ""}
                    className="size-5"
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>{commit.author_name || commit.author_login}</TooltipContent>
            </Tooltip>
          )}
          <span>{commit.author_login ?? commit.author_name ?? "unknown"}</span>
        </div>
        {commit.authored_at && <span>{format(new Date(commit.authored_at), "PPp")}</span>}
        <CopyButton
          value={commit.sha}
          iconClassName="size-3"
          className="flex items-center gap-1 font-mono hover:text-foreground"
        >
          {commit.sha.slice(0, 7)}
        </CopyButton>
        <span>
          {filesChanged} file{filesChanged === 1 ? "" : "s"} changed
        </span>
        <span className="text-accent-green">+{insertions}</span>
        <span className="text-accent-pink">-{deletions}</span>
      </div>
    </div>
  );
}

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
  const selectedCommit = commits.find((c) => c.sha === selectedSha);
  const { insertions, deletions } = diffStats(commitFiles);

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
              <CIBadge repoPath={repoPath} login={login} sha={c.sha} />
              <PRCommitVerificationBadge repoPath={repoPath} login={login} sha={c.sha} />
              <span className="ml-auto shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-secondary-foreground">
                {c.sha.slice(0, 7)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <ResizeHandle onPointerDown={onCommitsResize} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedCommit && (
          <PRCommitHeader
            commit={selectedCommit}
            filesChanged={commitFiles.length}
            insertions={insertions}
            deletions={deletions}
          />
        )}
        <div className="flex min-h-0 flex-1">
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
      </div>
    </div>
  );
}
