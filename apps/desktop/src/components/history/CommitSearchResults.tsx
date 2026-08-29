import {
  CherryIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchPlusIcon,
  ListOrderedIcon,
  Undo2Icon,
  WrenchIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { CommitSearchResult } from "@/lib/types";
import { cn } from "@gitbud/ui/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubCommitUrl } from "@/lib/github-links";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@gitbud/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { CIBadge } from "@/components/pr/CIBadge";
import { useRepoStore } from "@/store/useRepoStore";
import { useCherryPick, useCreateFixupCommit, useRevertCommit } from "@/hooks/queries/useCommitLog";
import { useStatus } from "@/hooks/queries/useRepoStatus";
import { useGitHubStore } from "@/store/useGitHubStore";

interface CommitSearchResultsProps {
  results: CommitSearchResult[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  onCreateBranchHere: (oid: string) => void;
  onRebaseFromHere: (oid: string) => void;
}

/** A flat, ungraphed rendering of `search_commits`' results — deliberately not `CommitList`
 * (which draws lane/graph lines between adjacent rows): search hits are scattered across the
 * repo's full history, not necessarily parent/child of one another, so drawing continuity lines
 * between them would imply a relationship that isn't there. Otherwise mirrors `CommitList`'s
 * row content and context menu as closely as `CommitSearchResult`'s smaller shape (no lane data,
 * author email, tags, or unpushed flag) allows. */
export function CommitSearchResults({
  results,
  selectedOid,
  onSelect,
  onCreateBranchHere,
  onRebaseFromHere,
}: CommitSearchResultsProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const cherryPickMutation = useCherryPick(repoPath);
  const revertCommitMutation = useRevertCommit(repoPath);
  const createFixupCommitMutation = useCreateFixupCommit(repoPath);
  const { data: status } = useStatus(repoPath);
  const hasStagedChanges = status?.files.some((f) => f.staged) ?? false;
  const currentLogin = useGitHubStore((s) => s.currentLogin);

  if (results.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">No matching commits</div>;
  }

  return (
    <div className="h-full overflow-auto">
      {results.map((commit) => {
        const initial = (commit.author_name || "?").trim().charAt(0).toUpperCase();
        return (
          <ContextMenu key={commit.oid}>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  "flex h-[52px] cursor-pointer items-center gap-2 border-b border-border/50 px-2 hover:bg-accent",
                  selectedOid === commit.oid && "bg-accent",
                )}
                onClick={() => onSelect(commit.oid)}
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{commit.summary}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{commit.author_name}</span>
                    <span>·</span>
                    <span className="truncate">
                      {formatDistanceToNow(new Date(commit.timestamp * 1000), {
                        addSuffix: true,
                      })}
                    </span>
                    {repoPath && currentLogin && (
                      <CIBadge repoPath={repoPath} login={currentLogin} sha={commit.oid} />
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
              <ContextMenuItem
                disabled={!hasStagedChanges}
                onSelect={() => createFixupCommitMutation.mutate(commit.oid)}
                className={!hasStagedChanges ? "flex-col items-start gap-0.5" : undefined}
              >
                <span className="flex items-center gap-2">
                  <WrenchIcon className="size-3.5" />
                  Create Fixup Commit
                </span>
                {!hasStagedChanges && (
                  <span className="pl-[22px] text-xs text-muted-foreground">
                    Stage changes to enable
                  </span>
                )}
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
  );
}
