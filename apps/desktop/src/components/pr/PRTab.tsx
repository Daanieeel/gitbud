import { useEffect, useState } from "react";
import { ExternalLinkIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@gitbud/ui/button";
import { cn } from "@gitbud/ui/utils";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { usePRStore, type PRFilter } from "@/store/usePRStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { isBrokenTokenError, usePullRequestList } from "@/hooks/queries/usePullRequests";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { queryKeys } from "@/lib/queryKeys";
import { evictRepoScopedPrQueries, evictSelectedPrQueries } from "@/lib/prCacheEviction";
import { PRList } from "./PRList";
import { PRDetail } from "./PRDetail";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { api } from "@/lib/tauri";
import { prefetchMergeSettings } from "@/lib/mergeSettingsPrefetch";
import { ApiErrorCard } from "@/components/ApiErrorCard";
import { openUrl } from "@tauri-apps/plugin-opener";

const OTHER_FORGE_PR_ISSUE_URL = "https://github.com/Daanieeel/gitbud/issues/40";

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
  const remoteInfo = useRemoteInfo(repoPath);
  const gatingDisabled = useSettingsStore((s) => s.settings.disable_provider_gating);
  const providerAllowed = gatingDisabled || remoteInfo?.provider === "github";

  useEffect(() => {
    if (!repoPath) return;
    void api.githubRemoteOwnerRepo(repoPath).then((r) => setHasRemote(r != null));
  }, [repoPath]);

  // Frees the (potentially huge, for a big PR's parsed file diffs) in-memory query cache for a
  // repo the moment you're no longer looking at its PRs: either the Pulls tab is left entirely
  // (PRTab unmounts, see App.tsx's `activeTab === "pulls"` conditional render) or you switch to
  // a different repo while staying on this tab, instead of waiting up to the default 5min
  // gcTime. Cheap either way: usePullRequests.ts's queryFns seed instantly from the local SQLite
  // mirror on the next visit.
  useEffect(() => {
    return () => {
      if (!repoPath) return;
      evictRepoScopedPrQueries(queryClient, repoPath);
    };
  }, [repoPath, queryClient]);

  // A single large PR's parsed file diffs can be hundreds of thousands of objects on their own,
  // so evict the previously-viewed PR's detail the moment you click a different one, rather than
  // waiting for gcTime. Clicking through several PRs in quick succession would otherwise pile
  // all of their diffs up in memory at once within that window. Deliberately not keyed on
  // `pulls` (the list), since that changes on every background list refresh and would evict the PR
  // you're *currently* looking at.
  useEffect(() => {
    return () => {
      if (!repoPath || selectedNumber === null) return;
      evictSelectedPrQueries(queryClient, repoPath, currentLogin ?? "", selectedNumber);
    };
  }, [selectedNumber, repoPath, currentLogin, queryClient]);

  // Force a fresh fetch whenever this tab is (re)entered or the filter changes, rather than
  // trusting whatever's still "fresh" by staleTime — a teammate's PR activity doesn't wait for a
  // staleTime window to expire, and the background sync (useProviderSync) only ever keeps the
  // "open" filter warm.
  useEffect(() => {
    if (repoPath && currentLogin) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.prList(repoPath, currentLogin, filter),
      });
    }
  }, [repoPath, currentLogin, filter, queryClient]);

  const {
    pulls,
    isLoading: loading,
    error: loadErrorObj,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
  } = usePullRequestList(hasRemote && providerAllowed ? repoPath : null, currentLogin, filter);
  const offline = useNetworkStore((s) => s.offline);
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

  // GitHub only for now — other forges (Codeberg/Gitea, GitLab, Bitbucket) have their own PR/MR
  // APIs, and gitbud only speaks GitHub's. `remoteInfo` is `null` briefly while `useRemoteInfo`
  // is still resolving, so this only renders once it's settled. Skippable via the "Disable
  // provider gating" advanced setting (mirrors IssueTab.tsx).
  if (!gatingDisabled && remoteInfo && remoteInfo.provider !== "github") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-dot-grid text-center text-sm text-muted-foreground">
        <p>Pull requests are currently only available for GitHub repositories</p>
        <Button variant="secondary" onClick={() => void openUrl(OTHER_FORGE_PR_ISSUE_URL)}>
          <ExternalLinkIcon className="size-3.5" />
          See implementation progress
        </Button>
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
        {loadError && offline && (
          <div className="m-2 rounded-md bg-accent-yellow/10 p-2 text-xs text-accent-yellow">
            <div className="flex items-center gap-1.5 font-medium">
              <WifiOffIcon className="size-3.5 shrink-0" />
              <span>You are offline</span>
            </div>
            <p className="mt-0.5 text-accent-yellow/80">
              {pulls.length > 0
                ? "Showing cached PRs. This state could be out of date."
                : "No cached PRs for this repo yet."}
            </p>
          </div>
        )}
        {loadError && !offline && <ApiErrorCard message={loadError} />}
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
