import { useState, useMemo, useRef, useEffect } from "react";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { ExternalLinkIcon, GitBranchIcon, GitMergeIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Avatar } from "@gitbud/ui/avatar";
import { BranchName } from "@gitbud/ui/branch-name";
import { DiffView } from "@gitbud/ui/diff-view";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { CIBadge } from "./CIBadge";
import { MergePRDialog } from "./MergePRDialog";
import { usePRStore } from "@/store/usePRStore";
import { useAddReviewComment, usePullRequestDetail } from "@/hooks/queries/usePullRequests";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { api } from "@/lib/tauri";
import type { ImageDiff, PullRequest } from "@/lib/types";
import { cn } from "@gitbud/ui/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { GenericFileMenuItems } from "@/components/changes/GenericFileMenuItems";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@gitbud/ui/context-menu";

interface PRDetailProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRDetail({ repoPath, login, pr }: PRDetailProps) {
  const selectedFilePath = usePRStore((s) => s.selectedFilePath);
  const selectFile = usePRStore((s) => s.selectFile);
  const { data } = usePullRequestDetail(repoPath, login, pr.number, pr.head_sha);
  const files = data?.files ?? [];
  const comments = data?.comments ?? [];
  const addCommentMutation = useAddReviewComment(repoPath, login, pr.number);
  const isPrTabActive = useIsPrTabActive();

  const [checkingOut, setCheckingOut] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [selectedImageDiff, setSelectedImageDiff] = useState<ImageDiff | null>(null);

  const checkout = async () => {
    setCheckingOut(true);
    try {
      await api.checkoutPullRequest(repoPath, pr.number);
    } finally {
      setCheckingOut(false);
    }
  };

  const selectedFile = files.find((f) => f.filename === selectedFilePath);
  const fileComments = comments.filter((c) => c.path === selectedFilePath);

  // The PR files API's `patch` text (what selectedFile.diff is parsed from) is empty for
  // binary files, so images need their bytes fetched separately via the Contents API.
  useEffect(() => {
    if (!selectedFile?.diff.is_image) {
      setSelectedImageDiff(null);
      return;
    }
    void api
      .githubGetPullRequestImageDiff(
        repoPath,
        login,
        selectedFile.filename,
        pr.base_sha,
        pr.head_sha,
      )
      .then(setSelectedImageDiff);
  }, [repoPath, login, selectedFile, pr.base_sha, pr.head_sha]);

  const filePaths = useMemo(() => files.map((f) => f.filename), [files]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedFilePath, (path) =>
    selectFile(path),
  );
  const fileListRef = useRef<HTMLDivElement>(null);
  const { width, onPointerDown } = useResizableWidth("panel-width:pr-files", 224, 160, 560);
  const remoteInfo = useRemoteInfo(repoPath);

  useEffect(() => {
    fileListRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Avatar src={pr.author_avatar_url} alt={pr.author_login} className="size-6" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">
            <BranchName className="h-5 px-1.5 text-xs">{pr.base_ref}</BranchName>
            <span className="shrink-0">←</span>
            <BranchName className="h-5 px-1.5 text-xs">{pr.head_ref}</BranchName>
          </div>
        </div>
        <CIBadge
          repoPath={repoPath}
          login={login}
          sha={pr.head_sha}
          pollIntervalMs={prPollIntervalMs(pr, isPrTabActive, true)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void openUrl(pr.html_url);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          </TooltipTrigger>
          <TooltipContent>Open on GitHub</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              disabled={checkingOut}
              onClick={() => void checkout()}
            >
              <GitBranchIcon className="size-3.5" />
              {checkingOut ? "Checking out…" : "Checkout"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{`Fetch and check out as local branch pr-${pr.number}`}</TooltipContent>
        </Tooltip>
        {!pr.merged && pr.state === "open" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={() => setMergeOpen(true)}>
                <GitMergeIcon className="size-3.5" />
                Merge…
              </Button>
            </TooltipTrigger>
            <TooltipContent>Merge this pull request</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div
          ref={fileListRef}
          tabIndex={0}
          onKeyDown={handleArrowNav}
          style={{ width }}
          className="shrink-0 overflow-auto border-r border-border outline-none"
        >
          {files.map((f) => (
            <ContextMenu key={f.filename}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "flex cursor-pointer select-none items-center gap-2 px-2 py-1 text-sm hover:bg-accent",
                        selectedFilePath === f.filename && "bg-accent",
                      )}
                      onClick={() => selectFile(f.filename)}
                    >
                      <FileTypeIcon path={f.filename} className="size-3.5 shrink-0" />
                      <FilePathLabel path={f.filename} />
                      <FileStatusIcon status={f.status} className="size-3.5" />
                    </div>
                  </ContextMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{`${f.filename} (${f.status})`}</TooltipContent>
              </Tooltip>
              <ContextMenuContent>
                <GenericFileMenuItems
                  repoPath={repoPath}
                  path={f.filename}
                  providerRef={pr.head_sha}
                  remoteInfo={remoteInfo}
                />
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
        <ResizeHandle onPointerDown={onPointerDown} />
        <div className="min-w-0 flex-1">
          <DiffView
            path={selectedFilePath}
            diff={selectedFile?.diff ?? null}
            imageDiff={selectedImageDiff}
            comments={fileComments}
            onAddComment={(line, side, body) => {
              if (!selectedFilePath) return;
              addCommentMutation.mutate({
                commitId: pr.head_sha,
                path: selectedFilePath,
                line,
                side,
                body,
              });
            }}
          />
        </div>
      </div>
      <MergePRDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        repoPath={repoPath}
        login={login}
        pr={pr}
      />
    </div>
  );
}
