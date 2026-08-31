import { useEffect, useState } from "react";
import { PlusIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@gitbud/ui/button";
import { cn } from "@gitbud/ui/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore, isBrokenTokenError } from "@/store/useGitHubStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useIssueStore, type IssueFilter } from "@/store/useIssueStore";
import { useIssueList } from "@/hooks/queries/useIssues";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { queryKeys } from "@/lib/queryKeys";
import { evictRepoScopedPrQueries, evictSelectedIssueQueries } from "@/lib/prCacheEviction";
import { IssueList } from "./IssueList";
import { IssueDetail } from "./IssueDetail";
import { CreateIssueDialog } from "./CreateIssueDialog";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { api } from "@/lib/tauri";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";

const FILTERS: { key: IssueFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function IssueTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const filter = useIssueStore((s) => s.filter);
  const setFilter = useIssueStore((s) => s.setFilter);
  const selectedNumber = useIssueStore((s) => s.selectedNumber);
  const selectIssue = useIssueStore((s) => s.selectIssue);
  const reauth = useGitHubStore((s) => s.reauth);
  const openSignIn = useGitHubStore((s) => s.openSignIn);

  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { width, onPointerDown } = useResizableWidth("panel-width:issue-list", 260, 240, 640);
  const queryClient = useQueryClient();
  const remoteInfo = useRemoteInfo(repoPath);

  useEffect(() => {
    if (!repoPath) return;
    void api.githubRemoteOwnerRepo(repoPath).then((r) => setHasRemote(r != null));
  }, [repoPath]);

  // Mirrors PRTab.tsx's eviction: free the (potentially large) in-memory query cache for a repo
  // the moment you're no longer looking at its issues, rather than waiting on gcTime.
  useEffect(() => {
    return () => {
      if (!repoPath) return;
      evictRepoScopedPrQueries(queryClient, repoPath);
    };
  }, [repoPath, queryClient]);

  useEffect(() => {
    return () => {
      if (!repoPath || selectedNumber === null) return;
      evictSelectedIssueQueries(queryClient, repoPath, currentLogin ?? "", selectedNumber);
    };
  }, [selectedNumber, repoPath, currentLogin, queryClient]);

  // Force a fresh fetch whenever this tab is (re)entered or the filter changes — mirrors
  // PRTab.tsx (issues have no background keep-warm sync of their own, see the plan's explicit
  // scope exclusion, so this is the only thing keeping the list from going stale).
  useEffect(() => {
    if (repoPath && currentLogin) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueList(repoPath, currentLogin, filter),
      });
    }
  }, [repoPath, currentLogin, filter, queryClient]);

  const {
    issues,
    isLoading: loading,
    error: loadErrorObj,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
  } = useIssueList(
    hasRemote && remoteInfo?.provider === "github" ? repoPath : null,
    currentLogin,
    filter,
  );
  const offline = useNetworkStore((s) => s.offline);
  const loadError = loadErrorObj ? String(loadErrorObj) : null;
  const hasMore = hasNextPage ?? false;

  if (!repoPath) return null;

  if (!currentLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm">Sign in with GitHub to see issues</p>
        <Button variant="secondary" onClick={openSignIn}>
          Sign in with GitHub
        </Button>
      </div>
    );
  }

  if (loadError && isBrokenTokenError(loadError)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm">{loadError}</p>
        <Button
          variant="secondary"
          disabled={reauthing}
          onClick={() => {
            setReauthing(true);
            void reauth(currentLogin).finally(() => setReauthing(false));
          }}
        >
          {reauthing ? "Reconnecting…" : "Reconnect GitHub"}
        </Button>
      </div>
    );
  }

  if (hasRemote === false) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        This repository has no GitHub origin remote
      </div>
    );
  }

  // GitHub only for now — GitLab/Bitbucket have their own issue trackers with different APIs,
  // and a plain/self-hosted git remote has no issues concept at all. `remoteInfo` is `null`
  // briefly while `useRemoteInfo` is still resolving, so this only renders once it's settled.
  if (remoteInfo && remoteInfo.provider !== "github") {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        Issues are only available for GitHub repositories
      </div>
    );
  }

  const selected = issues.find((i) => i.number === selectedNumber);

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div style={{ width }} className="flex shrink-0 flex-col border-r border-border">
        <div className="flex shrink-0 items-center gap-1 border-b border-border p-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2 py-1 text-xs hover:bg-accent",
                filter === f.key && "bg-accent font-medium",
              )}
            >
              {f.label}
            </button>
          ))}
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger>
              <Button size="iconSm" variant="secondary" onClick={() => setCreateOpen(true)}>
                <PlusIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create Issue</TooltipContent>
          </Tooltip>
        </div>
        <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
          {loading && issues.length === 0 ? "Loading…" : `${issues.length} ${filter}`}
        </div>
        {loadError && offline && (
          <div className="m-2 rounded-md bg-accent-yellow/10 p-2 text-xs text-accent-yellow">
            <div className="flex items-center gap-1.5 font-medium">
              <WifiOffIcon className="size-3.5 shrink-0" />
              <span>You are offline</span>
            </div>
            <p className="mt-0.5 text-accent-yellow/80">
              {issues.length > 0
                ? "Showing cached issues. This state could be out of date."
                : "No cached issues for this repo yet."}
            </p>
          </div>
        )}
        {loadError && !offline && (
          <div className="m-2 flex items-center gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{loadError}</span>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <IssueList
            loading={loading}
            repoPath={repoPath}
            login={currentLogin}
            issues={issues}
            selectedNumber={selectedNumber}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => hasMore && !loadingMore && void fetchNextPage()}
            onSelect={selectIssue}
          />
        </div>
      </div>
      <ResizeHandle onPointerDown={onPointerDown} />
      {selected ? (
        <IssueDetail repoPath={repoPath} login={currentLogin} issue={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-dot-grid text-sm text-muted-foreground">
          Select an issue
        </div>
      )}
      <CreateIssueDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
