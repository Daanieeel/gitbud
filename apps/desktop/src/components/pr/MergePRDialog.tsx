import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, GitMergeIcon, TriangleAlertIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Textarea } from "@gitbud/ui/textarea";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";
import { Skeleton } from "@gitbud/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { useMergePullRequest } from "@/hooks/queries/usePullRequests";
import { useBranches } from "@/hooks/queries/useBranches";
import { prPollIntervalMs, useCheckRuns, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { CheckRunsRefresh } from "./CheckRunsRefresh";
import { runIcon, runStatusLabel } from "./CIBadge";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { takePrefetchedMergeSettings } from "@/lib/mergeSettingsPrefetch";
import { cn } from "@gitbud/ui/utils";
import type { PullRequest, RepoMergeSettings } from "@/lib/types";

interface MergePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const METHODS: {
  key: "merge" | "squash" | "rebase";
  label: string;
  description: string;
  allowed: keyof RepoMergeSettings;
}[] = [
  {
    key: "merge",
    label: "Merge commit",
    description: "All commits added via a merge commit",
    allowed: "allow_merge_commit",
  },
  {
    key: "squash",
    label: "Squash and merge",
    description: "Commits combined into one commit",
    allowed: "allow_squash_merge",
  },
  {
    key: "rebase",
    label: "Rebase and merge",
    description: "Commits rebased onto the base branch",
    allowed: "allow_rebase_merge",
  },
];

export function MergePRDialog({ open, onOpenChange, repoPath, login, pr }: MergePRDialogProps) {
  const mergePRMutation = useMergePullRequest(repoPath, login);
  const queryClient = useQueryClient();

  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("squash");
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [merging, setMerging] = useState(false);
  const [targetBase, setTargetBase] = useState(pr.base_ref);
  const { data: branchData } = useBranches(repoPath);
  const localBranchNames = (branchData?.branches ?? [])
    .filter((b) => !b.is_remote && b.name !== pr.head_ref)
    .map((b) => b.name);
  // The PR's current base might not be checked out locally (e.g. reviewing someone else's PR
  // against a branch you've never fetched) — keep it selectable regardless.
  const baseOptions = localBranchNames.includes(pr.base_ref)
    ? localBranchNames
    : [pr.base_ref, ...localBranchNames];
  const isPrTabActive = useIsPrTabActive();
  const {
    data: runs = null,
    refetch: refetchRuns,
    isFetching: runsFetching,
    dataUpdatedAt: runsUpdatedAt,
  } = useCheckRuns(
    open ? repoPath : null,
    open ? login : null,
    open ? pr.head_sha : null,
    open ? prPollIntervalMs(pr, isPrTabActive, true) : null,
  );
  const [repoSettings, setRepoSettings] = useState<RepoMergeSettings | null>(null);

  // Force a fresh check-runs fetch every time this dialog opens — you're about to merge, so a
  // 20s-stale CI result (the shared staleTime CIBadge also uses) isn't good enough here.
  useEffect(() => {
    if (open)
      void queryClient.invalidateQueries({
        queryKey: queryKeys.checkRuns(repoPath, login, pr.head_sha),
      });
  }, [open, repoPath, login, pr.head_sha, queryClient]);

  // Reset per-open state right at the moment the dialog opens, mirroring CreatePRDialog.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setCommitTitle(`${pr.title} (#${pr.number})`);
      setCommitMessage("");
      setTargetBase(pr.base_ref);
    }
    wasOpenRef.current = open;
  }, [open, pr.title, pr.number, pr.base_ref]);

  // Only offer merge methods this repo (and this base branch's protection rules, e.g. "require
  // linear history" ruling out merge commits) actually allow — GitHub 405s on a disallowed one
  // otherwise — and start the "delete branch" checkbox at the repo's own default for it rather
  // than always off.
  useEffect(() => {
    if (!open) return;
    // Re-fetched fresh on every open (not cached across dialog opens) since these settings —
    // especially branch protection rules — can change between one merge and the next.
    setRepoSettings(null);
    let cancelled = false;
    // Reuse a prefetch already in flight from the PR tab (see mergeSettingsPrefetch) if there is
    // one, instead of firing a redundant duplicate request — but this always consumes it rather
    // than caching by result, so the *next* open still fires a genuinely fresh request.
    (
      (targetBase === pr.base_ref
        ? takePrefetchedMergeSettings(repoPath, login, targetBase)
        : null) ?? api.githubGetRepoMergeSettings(repoPath, login, targetBase)
    ).then(
      (settings) => {
        if (cancelled) return;
        setRepoSettings(settings);
        setDeleteBranch(settings.delete_branch_on_merge);
        setMethod((prev) => {
          const isAllowed = (key: typeof prev) =>
            settings[METHODS.find((m) => m.key === key)!.allowed];
          return isAllowed(prev) ? prev : (METHODS.find((m) => settings[m.allowed])?.key ?? prev);
        });
      },
      (err) => {
        if (cancelled) return;
        console.error("Failed to load repo merge settings:", err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, repoPath, login, targetBase, pr.base_ref]);

  // Vacuously true for no checks at all (nothing to block on) and false while still loading —
  // we don't want to flash the confident "default" color before we actually know.
  const allChecksPassing =
    runs !== null &&
    runs.every(
      (r) =>
        r.status === "completed" &&
        r.conclusion &&
        ["success", "neutral", "skipped"].includes(r.conclusion),
    );

  const submit = async () => {
    setMerging(true);
    try {
      // The merge endpoint always merges into whatever base is currently set on the PR, so a
      // changed target has to be pushed as its own update first.
      if (targetBase !== pr.base_ref) {
        await api.githubUpdatePullRequestBase(repoPath, login, pr.number, targetBase);
      }
      await mergePRMutation.mutateAsync({
        number: pr.number,
        method,
        commitTitle,
        commitMessage,
        sha: pr.head_sha,
        deleteBranch,
        headRef: pr.head_ref,
        baseRef: targetBase,
      });
      onOpenChange(false);
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[36rem] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMergeIcon className="size-4 shrink-0" />
            <span className="truncate">
              {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-mono">{pr.head_ref}</span>
            <span>→</span>
            <select
              value={targetBase}
              onChange={(e) => setTargetBase(e.target.value)}
              className="h-6 rounded-md border border-input bg-transparent px-1.5 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {baseOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {targetBase !== pr.base_ref && (
            <div className="flex items-center gap-1.5 rounded-md bg-accent-yellow/10 px-2 py-1.5 text-xs text-accent-yellow">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              This PR will be retargeted from {pr.base_ref} to {targetBase} before merging.
            </div>
          )}

          {pr.mergeable === false && targetBase === pr.base_ref && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              This branch has conflicts with {pr.base_ref} and may not be mergeable.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Checks</span>
              <CheckRunsRefresh
                dataUpdatedAt={runsUpdatedAt}
                isFetching={runsFetching}
                onRefresh={() => void refetchRuns()}
                pollIntervalMs={open ? prPollIntervalMs(pr, isPrTabActive, true) : null}
              />
            </div>
            <div className="flex flex-col gap-1 rounded-md border border-border p-1 text-xs">
              {runs === null ? (
                <div className="flex flex-col gap-1.5 py-0.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Skeleton className="size-3.5 shrink-0 rounded-full" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="ml-auto h-3 w-14" />
                    </div>
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <span className="text-muted-foreground">No checks reported</span>
              ) : (
                <div className="flex max-h-40 flex-col overflow-auto">
                  {runs.map((r) => (
                    <a
                      key={r.name}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void openUrl(r.html_url);
                      }}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                    >
                      {runIcon(r)}
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="shrink-0 text-muted-foreground">{runStatusLabel(r)}</span>
                      <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Merge method</span>
            <div className="flex gap-2">
              {METHODS.map((m) => {
                const allowed = repoSettings ? repoSettings[m.allowed] : true;
                const card = (
                  <button
                    key={m.key}
                    type="button"
                    // Not a real `disabled` attribute: a disabled element receives no pointer
                    // events in most browsers, which would silently prevent the tooltip below
                    // from ever showing on hover.
                    aria-disabled={!allowed}
                    className={cn(
                      "flex-1 rounded-md border border-border p-2 text-left",
                      !allowed && "cursor-not-allowed opacity-40",
                      method === m.key && "border-2 border-primary bg-primary/10 p-[7px]",
                    )}
                    onClick={() => allowed && setMethod(m.key)}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </div>
                  </button>
                );
                if (allowed) return card;
                return (
                  <Tooltip key={m.key}>
                    <TooltipTrigger asChild>{card}</TooltipTrigger>
                    <TooltipContent>
                      Disabled by this repository's merge settings or branch protection rules
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <Input
            placeholder="Commit title"
            value={commitTitle}
            onChange={(e) => setCommitTitle(e.target.value)}
            autoComplete="off"
          />
          <Textarea
            placeholder="Description"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={3}
            autoComplete="off"
          />
        </div>
        <DialogFooter className="sm:items-center sm:gap-4">
          <CheckboxGroup
            className="text-sm text-muted-foreground"
            variant="destructive"
            checked={deleteBranch}
            onCheckedChange={(checked) => setDeleteBranch(checked === true)}
          >
            Delete branch after merge
          </CheckboxGroup>
          {allChecksPassing ? (
            <Button disabled={merging || !commitTitle.trim()} onClick={() => void submit()}>
              <GitMergeIcon className="size-3.5" />
              {merging ? "Merging…" : METHODS.find((m) => m.key === method)?.label}
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  disabled={merging || !commitTitle.trim()}
                  onClick={() => void submit()}
                >
                  <GitMergeIcon className="size-3.5" />
                  {merging ? "Merging…" : METHODS.find((m) => m.key === method)?.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Not all checks have passed yet</TooltipContent>
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
