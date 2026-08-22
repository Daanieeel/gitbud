import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheckIcon } from "lucide-react";
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
import { CIBadge } from "@/components/pr/CIBadge";
import { CommitGraph } from "./CommitGraph";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";

const ROW_HEIGHT = 52;

interface CommitListProps {
  commits: CommitEntry[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  onNeedMore: () => void;
  onCreateBranchHere: (oid: string) => void;
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
    <span title="Verified signature">
      <ShieldCheckIcon className="size-3 shrink-0 text-accent-green" />
    </span>
  );
}

export function CommitList({ commits, selectedOid, onSelect, onNeedMore, onCreateBranchHere }: CommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const cherryPick = useRepoStore((s) => s.cherryPick);
  const revertCommit = useRepoStore((s) => s.revertCommit);
  const currentLogin = useGitHubStore((s) => s.currentLogin);

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
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{commit.summary}</div>
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
                  Open Commit on GitHub
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => void cherryPick(commit.oid)}>Cherry-pick</ContextMenuItem>
                <ContextMenuItem onSelect={() => void revertCommit(commit.oid)}>Revert</ContextMenuItem>
                <ContextMenuItem onSelect={() => onCreateBranchHere(commit.oid)}>
                  Create Branch Here
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
