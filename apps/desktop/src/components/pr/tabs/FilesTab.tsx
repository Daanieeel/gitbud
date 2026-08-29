import { useState, useMemo, useRef, useEffect } from "react";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { EyeOffIcon } from "lucide-react";
import { Checkbox } from "@gitbud/ui/checkbox";
import { DiffView } from "@gitbud/ui/diff-view";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { usePRStore } from "@/store/usePRStore";
import {
  useAddReviewComment,
  useReplyToReviewComment,
  usePullRequestDetail,
} from "@/hooks/queries/usePullRequests";
import {
  useMarkFileViewed,
  useResolveThread,
  useReviewThreads,
  useViewedFiles,
} from "@/hooks/queries/usePRReviewThreads";
import { joinCommentsWithThreads, threadIdForComment } from "@/lib/reviewThreadJoin";
import { api } from "@/lib/tauri";
import type { ImageDiff, PullRequest } from "@/lib/types";
import { cn } from "@gitbud/ui/utils";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { GenericFileMenuItems } from "@/components/changes/GenericFileMenuItems";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@gitbud/ui/context-menu";

interface FilesTabProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function FilesTab({ repoPath, login, pr }: FilesTabProps) {
  const selectedFilePath = usePRStore((s) => s.selectedFilePath);
  const selectFile = usePRStore((s) => s.selectFile);
  const { data } = usePullRequestDetail(repoPath, login, pr.number, pr.head_sha);
  const files = data?.files ?? [];
  const comments = data?.comments ?? [];
  const addCommentMutation = useAddReviewComment(repoPath, login, pr.number);
  const replyMutation = useReplyToReviewComment(repoPath, login, pr.number);

  const { data: threads = [] } = useReviewThreads(repoPath, login, pr.number);
  const resolveThreadMutation = useResolveThread(repoPath, login, pr.number);
  const { data: viewedFiles = new Set<string>() } = useViewedFiles(repoPath, login, pr.number);
  const markViewedMutation = useMarkFileViewed(repoPath, login, pr.number);
  const [hideViewed, setHideViewed] = useState(false);

  const [selectedImageDiff, setSelectedImageDiff] = useState<ImageDiff | null>(null);

  const selectedFile = files.find((f) => f.filename === selectedFilePath);
  const joinedComments = useMemo(
    () => joinCommentsWithThreads(comments, threads),
    [comments, threads],
  );
  const fileComments = joinedComments.filter((c) => c.path === selectedFilePath);

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

  const visibleFiles = hideViewed ? files.filter((f) => !viewedFiles.has(f.filename)) : files;
  const filePaths = useMemo(() => visibleFiles.map((f) => f.filename), [visibleFiles]);
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
    <div className="flex min-h-0 flex-1">
      <div
        ref={fileListRef}
        tabIndex={0}
        onKeyDown={handleArrowNav}
        style={{ width }}
        className="flex shrink-0 flex-col overflow-hidden border-r border-border outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1">
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setHideViewed((v) => !v)}
                className={cn(
                  "text-muted-foreground hover:text-foreground",
                  hideViewed && "text-foreground",
                )}
              >
                <EyeOffIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hideViewed ? "Show viewed files" : "Hide viewed files"}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {visibleFiles.map((f) => (
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
                      <Checkbox
                        checked={viewedFiles.has(f.filename)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) =>
                          markViewedMutation.mutate({ path: f.filename, viewed: checked === true })
                        }
                      />
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
          onReply={(rootCommentId, body) =>
            replyMutation.mutate({ inReplyTo: rootCommentId, body })
          }
          onResolveThread={(rootCommentId, resolved) => {
            const threadId = threadIdForComment(rootCommentId, threads);
            if (!threadId) return;
            resolveThreadMutation.mutate({ threadId, resolved });
          }}
        />
      </div>
    </div>
  );
}
