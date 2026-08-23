import { useState, useMemo, useRef, useEffect } from "react";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { ExternalLinkIcon, GitBranchIcon, GitMergeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { DiffView } from "@/components/diff/DiffView";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CIBadge } from "./CIBadge";
import { MergePRDialog } from "./MergePRDialog";
import { usePRStore } from "@/store/usePRStore";
import { useAddReviewComment, usePullRequestDetail } from "@/hooks/queries/usePullRequests";
import { api } from "@/lib/tauri";
import type { ImageDiff, PullRequest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileTypeIcon } from "@/lib/file-icons";
import { FilePathLabel } from "@/components/changes/FilePathLabel";

const PR_STATUS_COLOR: Record<string, string> = {
  added: "bg-accent-green",
  modified: "bg-accent-green",
  changed: "bg-accent-green",
  removed: "bg-accent-pink",
  renamed: "bg-muted-foreground",
  copied: "bg-muted-foreground",
  unchanged: "bg-transparent",
};

interface PRDetailProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRDetail({ repoPath, login, pr }: PRDetailProps) {
  const selectedFilePath = usePRStore((s) => s.selectedFilePath);
  const selectFile = usePRStore((s) => s.selectFile);
  const { data } = usePullRequestDetail(repoPath, login, pr.number);
  const files = data?.files ?? [];
  const comments = data?.comments ?? [];
  const addCommentMutation = useAddReviewComment(repoPath, login, pr.number);

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
      .githubGetPullRequestImageDiff(repoPath, login, selectedFile.filename, pr.base_sha, pr.head_sha)
      .then(setSelectedImageDiff);
  }, [repoPath, login, selectedFile, pr.base_sha, pr.head_sha]);

  const filePaths = useMemo(() => files.map((f) => f.filename), [files]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedFilePath, (path) => selectFile(path));
  const fileListRef = useRef<HTMLDivElement>(null);

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
          <div className="text-xs text-muted-foreground">
            {pr.head_ref} → {pr.base_ref}
          </div>
        </div>
        <CIBadge repoPath={repoPath} login={login} sha={pr.head_sha} />
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
        <div ref={fileListRef} tabIndex={0} onKeyDown={handleArrowNav} className="w-56 shrink-0 overflow-auto border-r border-border outline-none">
          {files.map((f) => (
            <Tooltip key={f.filename}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 px-2 py-1 text-sm hover:bg-accent",
                    selectedFilePath === f.filename && "bg-accent",
                  )}
                  onClick={() => selectFile(f.filename)}
                >
                  <span className="relative shrink-0">
                    <FileTypeIcon path={f.filename} className="size-3.5" />
                    <span
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background",
                        PR_STATUS_COLOR[f.status] || "bg-muted-foreground",
                      )}
                    />
                  </span>
                  <FilePathLabel path={f.filename} />
                </div>
              </TooltipTrigger>
              <TooltipContent>{`${f.filename} (${f.status})`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <DiffView
            path={selectedFilePath}
            diff={selectedFile?.diff ?? null}
            imageDiff={selectedImageDiff}
            comments={fileComments}
            onAddComment={(line, side, body) => {
              if (!selectedFilePath) return;
              addCommentMutation.mutate({ commitId: pr.head_sha, path: selectedFilePath, line, side, body });
            }}
          />
        </div>
      </div>
      <MergePRDialog open={mergeOpen} onOpenChange={setMergeOpen} repoPath={repoPath} login={login} pr={pr} />
    </div>
  );
}
