import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import {
  CherryIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchPlusIcon,
  ListOrderedIcon,
  ShieldCheckIcon,
  Undo2Icon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CommitEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { api } from "@/lib/tauri";
import { copyToClipboard } from "@/lib/clipboard";
import { githubCommitUrl } from "@/lib/github-links";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar } from "@/components/ui/avatar";
import { CIBadge } from "@/components/pr/CIBadge";
import { CommitGraph } from "./CommitGraph";
import { useRepoStore } from "@/store/useRepoStore";
import { useCherryPick, useRevertCommit } from "@/hooks/queries/useCommitLog";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useAuthorAvatar } from "@/hooks/useAuthorAvatar";

const ROW_HEIGHT = 52;

interface CommitListProps {
  commits: CommitEntry[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  onNeedMore: () => void;
  onCreateBranchHere: (oid: string) => void;
  onRebaseFromHere: (oid: string) => void;
}

function VerificationBadge({ repoPath, login, sha }: { repoPath: string; login: string; sha: string }) {
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

export function CommitAuthorAvatar({
  repoPath,
  login,
  email,
  initial,
}: {
  repoPath: string | null;
  login: string | null;
  email: string;
  initial: string;
}) {
  const avatarUrl = useAuthorAvatar(repoPath, login, email);
  if (avatarUrl) {
    return <Avatar src={avatarUrl} alt={initial} className="size-6" />;
  }
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
      {initial}
    </div>
  );
}

export function CommitList({
  commits,
  selectedOid,
  onSelect,
  onNeedMore,
  onCreateBranchHere,
  onRebaseFromHere,
}: CommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const cherryPickMutation = useCherryPick(repoPath);
  const revertCommitMutation = useRevertCommit(repoPath);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [tagsByOid, setTagsByOid] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!repoPath) return;
    void api.listTags(repoPath).then((tags) => {
      const map = new Map<string, string[]>();
      for (const tag of tags) {
        map.set(tag.oid, [...(map.get(tag.oid) ?? []), tag.name]);
      }
      setTagsByOid(map);
    });
  }, [repoPath]);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const laneCount = useMemo(() => {
    let max = 0;
    for (const c of commits) {
      max = Math.max(max, c.lane);
      for (const l of c.active_lanes) max = Math.max(max, l);
    }
    return max + 1;
  }, [commits]);

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (lastIndex >= commits.length - 5) onNeedMore();
  }, [lastIndex, commits.length, onNeedMore]);

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((row) => {
          const commit = commits[row.index];
          const initial = (commit.author_name || commit.author_email || "?")
            .trim()
            .charAt(0)
            .toUpperCase();
          return (
            <ContextMenu key={commit.oid}>
              <ContextMenuTrigger asChild>
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: row.size,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-b border-border/50 px-2 hover:bg-accent",
                    selectedOid === commit.oid && "bg-accent",
                  )}
                  onClick={() => onSelect(commit.oid)}
                >
                  <CommitGraph
                    commit={commit}
                    prevActiveLanes={commits[row.index - 1]?.active_lanes}
                    laneCount={laneCount}
                    rowHeight={row.size}
                  />
                  <CommitAuthorAvatar
                    repoPath={repoPath}
                    login={currentLogin}
                    email={commit.author_email}
                    initial={initial}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 truncate text-sm">
                      {(tagsByOid.get(commit.oid) ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="shrink-0 rounded bg-secondary px-1 py-0.5 font-mono text-[10px] text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="truncate">{commit.summary}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate">
                        {formatDistanceToNow(new Date(commit.timestamp * 1000), { addSuffix: true })}
                      </span>
                      {repoPath && currentLogin && (
                        <>
                          <CIBadge repoPath={repoPath} login={currentLogin} sha={commit.oid} />
                          <VerificationBadge repoPath={repoPath} login={currentLogin} sha={commit.oid} />
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-xs text-muted-foreground">
                    {commit.short_oid}
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => void copyToClipboard(commit.oid)}>
                  <CopyIcon className="size-3.5" />
                  Copy SHA
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    if (!repoPath) return;
                    void githubCommitUrl(repoPath, commit.oid).then((url) => {
                      if (url) void openUrl(url);
                    });
                  }}
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Open Commit on GitHub
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => cherryPickMutation.mutate(commit.oid)}>
                  <CherryIcon className="size-3.5" />
                  Cherry-pick
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => revertCommitMutation.mutate(commit.oid)}>
                  <Undo2Icon className="size-3.5" />
                  Revert
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCreateBranchHere(commit.oid)}>
                  <GitBranchPlusIcon className="size-3.5" />
                  Create Branch Here
                </ContextMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ContextMenuItem onSelect={() => onRebaseFromHere(commit.oid)}>
                      <ListOrderedIcon className="size-3.5" />
                      Interactive Rebase from Here
                    </ContextMenuItem>
                  </TooltipTrigger>
                  <TooltipContent>
                    Rebase replays the commits after this one on top of a new base, rewriting their
                    history
                  </TooltipContent>
                </Tooltip>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
