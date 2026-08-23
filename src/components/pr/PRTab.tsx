import { useEffect, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore, type PRFilter } from "@/store/usePRStore";
import { isBrokenTokenError, usePullRequestList } from "@/hooks/queries/usePullRequests";
import { queryKeys } from "@/lib/queryKeys";
import { PRList } from "./PRList";
import { PRDetail } from "./PRDetail";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { api } from "@/lib/tauri";
import { prefetchMergeSettings } from "@/lib/mergeSettingsPrefetch";

const FILTERS: { key: PRFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export function PRTab() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const filter = usePRStore((s) => s.filter);
  const setFilter = usePRStore((s) => s.setFilter);
  const selectedNumber = usePRStore((s) => s.selectedNumber);
  const selectPR = usePRStore((s) => s.selectPR);
  const reauth = useGitHubStore((s) => s.reauth);
  const openSignIn = useGitHubStore((s) => s.openSignIn);

  const [hasRemote, setHasRemote] = useState<boolean | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const { width, onPointerDown } = useResizableWidth("panel-width:pr-list", 260, 240, 640);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!repoPath) return;
    void api.githubRemoteOwnerRepo(repoPath).then((r) => setHasRemote(r != null));
  }, [repoPath]);

  // Force a fresh fetch whenever this tab is (re)entered or the filter changes, rather than
  // trusting whatever's still "fresh" by staleTime — a teammate's PR activity doesn't wait for a
  // staleTime window to expire, and the background sync (useProviderSync) only ever keeps the
  // "open" filter warm.
  useEffect(() => {
    if (repoPath && currentLogin) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.prList(repoPath, currentLogin, filter) });
    }
  }, [repoPath, currentLogin, filter, queryClient]);

  const {
    pulls,
    isLoading: loading,
    error: loadErrorObj,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
  } = usePullRequestList(hasRemote ? repoPath : null, currentLogin, filter);
  const loadError = loadErrorObj ? String(loadErrorObj) : null;
  const hasMore = hasNextPage ?? false;

  // Warm the merge dialog's allowed-methods check as soon as this tab has PRs to show, so it's
  // (very likely) already resolved by the time the user actually opens a merge dialog — most
  // PRs in a repo target the same one or two base branches.
  useEffect(() => {
    if (!repoPath || !currentLogin) return;
    const baseRefs = new Set(pulls.map((p) => p.base_ref));
    for (const baseRef of baseRefs) prefetchMergeSettings(repoPath, currentLogin, baseRef);
  }, [repoPath, currentLogin, pulls]);

  if (!repoPath) return null;

  if (!currentLogin) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <TriangleAlertIcon className="size-8 text-destructive" />
        <p className="max-w-sm">Sign in with GitHub to see pull requests</p>
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

  const selected = pulls.find((p) => p.number === selectedNumber);

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
        </div>
        <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
          {loading && pulls.length === 0 ? "Loading…" : `${pulls.length} ${filter}`}
        </div>
        {loadError && <div className="p-2 text-xs text-destructive">{loadError}</div>}
        <div className="min-h-0 flex-1">
          <PRList
            loading={loading}
            repoPath={repoPath}
            login={currentLogin}
            pulls={pulls}
            selectedNumber={selectedNumber}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => hasMore && !loadingMore && void fetchNextPage()}
            onSelect={selectPR}
          />
        </div>
      </div>
      <ResizeHandle onPointerDown={onPointerDown} />
      {selected ? (
        <PRDetail repoPath={repoPath} login={currentLogin} pr={selected} />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-dot-grid text-sm text-muted-foreground">
          Select a pull request
        </div>
      )}
    </div>
  );
}
