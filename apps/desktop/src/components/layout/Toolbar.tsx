import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitPullRequestCreateArrow, GitPullRequestArrowIcon, ExternalLinkIcon, CodeIcon, ArrowUpIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useAheadBehind, DEFAULT_AHEAD_BEHIND } from "@/hooks/queries/useAheadBehind";
import { useGitSync } from "@/hooks/queries/useGitSync";
import { usePullRequestList } from "@/hooks/queries/usePullRequests";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { firstMatch } from "@/lib/utils";
import { detectRemoteProvider } from "@/lib/remote-provider";
import { CUSTOM_EDITOR_ID, customEditorName, findEditor } from "@/lib/editors";
import { useCustomEditorIcon } from "@/hooks/queries/useCustomEditorIcon";
import { GitHubMark } from "@/components/github/GitHubMark";
import { GitLabMark } from "@/components/github/GitLabMark";
import { BitbucketMark } from "@/components/github/BitbucketMark";
import { BranchSwitcher } from "@/components/repo/BranchSwitcher";
import { BranchPruner } from "@/components/repo/BranchPruner";
import { TagsPanel } from "@/components/repo/TagsPanel";
import { SubmodulesPanel } from "@/components/repo/SubmodulesPanel";
import { WorktreesPanel } from "@/components/repo/WorktreesPanel";
import { ReflogPanel } from "@/components/history/ReflogPanel";
import { LfsPanel } from "@/components/repo/LfsPanel";
import { SyncButton } from "@/components/repo/SyncButton";
import { CreatePRDialog } from "@/components/pr/CreatePRDialog";
import { Button } from "@gitbud/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";

export function Toolbar() {
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const branch = branchData?.branch ?? null;
  const branches = branchData?.branches ?? [];
  const localBranches = branches.filter((b) => !b.is_remote && b.name !== branch);
  const hasOtherBranch = localBranches.length > 0;
  // Mirrors CreatePRDialog's own default-base pick, so "commits to PR" means commits ahead of
  // the same base branch the dialog would diff against — not just "repo has commits somewhere".
  const defaultBase = localBranches.find((b) => b.name === "main" || b.name === "master")?.name ?? localBranches[0]?.name ?? null;
  const { data: aheadBehind = DEFAULT_AHEAD_BEHIND } = useAheadBehind(repoPath);
  const { data: branchCommits } = useQuery({
    queryKey: queryKeys.branchCommits(repoPath ?? "", defaultBase ?? "", branch ?? ""),
    queryFn: () => api.getBranchCommits(repoPath as string, defaultBase as string, branch as string),
    enabled: !!repoPath && !!defaultBase && !!branch,
  });
  const hasCommits = (branchCommits?.length ?? 0) > 0;
  // Of the commits ahead of base, how many are actually on origin/branch — `ahead` is how many
  // aren't (only meaningful once `published`, since an unpublished branch reports `ahead: 0`
  // regardless of how many local commits it has).
  const pushedCommitCount = aheadBehind.published ? Math.max(0, (branchCommits?.length ?? 0) - aheadBehind.ahead) : 0;
  const hasPushedCommit = pushedCommitCount > 0;
  const hasUnpushedCommit = aheadBehind.published && aheadBehind.ahead > 0;
  const previewPrDisabledReason = firstMatch([
    [!hasOtherBranch, "No branch to open into"],
    [!hasCommits, "No commits yet"],
    [!hasPushedCommit, "Need at least one pushed commit"],
  ]);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const selectPR = usePRStore((s) => s.selectPR);
  const setPRFilter = usePRStore((s) => s.setFilter);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const { push: pushBranch, syncing } = useGitSync(repoPath, branch);
  // Shares the exact same cache useProviderSync keeps warm in the background and CreatePRDialog
  // invalidates on submit — this is what makes "Preview PR" flip to "View PR" both right after
  // creating one in-app and after a teammate opens one, without its own separate fetch.
  const { pulls: openPulls } = usePullRequestList(repoPath, currentLogin, "open");
  const existingPrNumber = openPulls.find((p) => p.head_ref === branch)?.number ?? null;
  const [remoteInfo, setRemoteInfo] = useState<{ url: string; provider: ReturnType<typeof detectRemoteProvider> } | null>(null);
  const favoriteEditorId = useSettingsStore((s) => s.settings.favorite_editor);
  const customEditorCommand = useSettingsStore((s) => s.settings.custom_editor_command);
  const favoriteEditorOption = findEditor(favoriteEditorId);
  const isCustomEditor = favoriteEditorId === CUSTOM_EDITOR_ID && !!customEditorCommand;
  const customIcon = useCustomEditorIcon(isCustomEditor ? customEditorCommand : null);
  const editorName = favoriteEditorOption?.name ?? (isCustomEditor && customEditorCommand ? customEditorName(customEditorCommand) : "Editor");

  useEffect(() => {
    setRemoteInfo(null);
    if (!repoPath) return;
    let cancelled = false;
    void api.remoteWebInfo(repoPath).then((info) => {
      if (cancelled || !info) return;
      const [host, url] = info;
      setRemoteInfo({ url, provider: detectRemoteProvider(host) });
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  useEffect(() => {
    const handleOpenCreatePr = () => setPreviewPrOpen(true);
    window.addEventListener("open-create-pr", handleOpenCreatePr);
    return () => window.removeEventListener("open-create-pr", handleOpenCreatePr);
  }, []);

  const handlePreviewPrClick = () => {
    if (previewPrDisabledReason != null) return;
    if (hasUnpushedCommit) {
      setPushConfirmOpen(true);
      return;
    }
    setPreviewPrOpen(true);
  };

  const handlePushThenPreview = async () => {
    setPushConfirmOpen(false);
    try {
      await pushBranch();
    } catch {
      // runGitSync already surfaced its own error toast — just don't open the dialog.
      return;
    }
    setPreviewPrOpen(true);
  };


  return (
    <header className="flex shrink-0 items-center gap-2 p-2">
      <BranchSwitcher />
      <BranchPruner />
      <TagsPanel />
      <SubmodulesPanel />
      <WorktreesPanel />
      <ReflogPanel />
      <LfsPanel />
      <div className="flex flex-row gap-0">
        {remoteInfo && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => void openUrl(remoteInfo.url)}>
                {remoteInfo.provider === "github" && <GitHubMark className="size-3.5" />}
                {remoteInfo.provider === "gitlab" && <GitLabMark className="size-3.5" />}
                {remoteInfo.provider === "bitbucket" && <BitbucketMark className="size-3.5" />}
                {remoteInfo.provider === "unknown" && <ExternalLinkIcon className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>View repo on remote</TooltipContent>
          </Tooltip>
        )}
        {(favoriteEditorOption || isCustomEditor) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!repoPath || !favoriteEditorId) return;
                  void api.openInEditor(repoPath, favoriteEditorId, customEditorCommand).catch((err) => toast.error(String(err)));
                }}
              >
                {favoriteEditorOption ? (
                  <img
                    src={favoriteEditorOption.icon}
                    alt=""
                    className={favoriteEditorOption.id === "zed" ? "size-5" : "size-3.5"}
                  />
                ) : customIcon ? (
                  <img src={customIcon} alt="" className="size-5" />
                ) : (
                  <CodeIcon className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in {editorName}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex-1" />
      {currentLogin && existingPrNumber != null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="caution"
              size="sm"
              onClick={() => {
                if (!repoPath) return;
                setPRFilter("open");
                selectPR(existingPrNumber);
                setActiveTab("pulls");
              }}
            >
              <GitPullRequestArrowIcon className="size-3.5" />
              View PR
            </Button>
          </TooltipTrigger>
          <TooltipContent>View the existing pull request for this branch</TooltipContent>
        </Tooltip>
      )}
      {currentLogin && existingPrNumber == null && (
        <Popover open={pushConfirmOpen} onOpenChange={setPushConfirmOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                {/* Not a real `disabled` attribute: a disabled element receives no pointer events
                 * in most browsers, which would silently prevent the tooltip from showing. */}
                <Button
                  variant="positive"
                  size="sm"
                  aria-disabled={previewPrDisabledReason != null}
                  className={previewPrDisabledReason != null ? "cursor-not-allowed opacity-40" : undefined}
                  onClick={handlePreviewPrClick}
                >
                  <GitPullRequestCreateArrow className="size-3.5" />
                  Preview PR
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{previewPrDisabledReason ?? "Preview and open a pull request for this branch"}</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-fit space-y-3 p-3" align="center">
            <p className="max-w-xs text-sm opacity-80">
              This branch has unpushed commits.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setPushConfirmOpen(false); setPreviewPrOpen(true); }}>
                Preview Without Pushing
              </Button>
              <Button size="sm" variant="default" disabled={syncing} onClick={() => void handlePushThenPreview()}>
                <ArrowUpIcon className="size-3.5" />
                Push ({aheadBehind.ahead}) &amp; Preview
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <SyncButton />
      <CreatePRDialog open={previewPrOpen} onOpenChange={setPreviewPrOpen} />
    </header>
  );
}
