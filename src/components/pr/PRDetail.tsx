import { useState, useMemo, useRef, useEffect } from "react";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { ExternalLinkIcon, GitBranchIcon, GitMergeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffView } from "@/components/diff/DiffView";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CIBadge } from "./CIBadge";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import type { PullRequest } from "@/lib/types";
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
  const files = usePRStore((s) => s.files);
  const selectedFilePath = usePRStore((s) => s.selectedFilePath);
  const comments = usePRStore((s) => s.comments);
  const selectFile = usePRStore((s) => s.selectFile);
  const addComment = usePRStore((s) => s.addComment);
  const mergePR = usePRStore((s) => s.mergePR);

  const [checkingOut, setCheckingOut] = useState(false);
  const [merging, setMerging] = useState(false);

  const checkout = async () => {
    setCheckingOut(true);
    try {
      await api.checkoutPullRequest(repoPath, pr.number);
    } finally {
      setCheckingOut(false);
    }
  };

  const merge = async (method: string) => {
    setMerging(true);
    try {
      await mergePR(repoPath, login, pr.number, method);
    } finally {
      setMerging(false);
    }
  };

  const selectedFile = files.find((f) => f.filename === selectedFilePath);
  const fileComments = comments.filter((c) => c.path === selectedFilePath);

  const filePaths = useMemo(() => files.map((f) => f.filename), [files]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedFilePath, (path) => selectFile(path));
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fileListRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TooltipTrigger asChild>
                  <Button size="sm" disabled={merging}>
                    <GitMergeIcon className="size-3.5" />
                    {merging ? "Merging…" : "Merge"}
                  </Button>
                </TooltipTrigger>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void merge("merge")}>
                  <GitMergeIcon className="size-3.5" />
                  Create merge commit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void merge("squash")}>
                  <GitMergeIcon className="size-3.5" />
                  Squash and merge
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void merge("rebase")}>
                  <GitMergeIcon className="size-3.5" />
                  Rebase and merge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            comments={fileComments}
            onAddComment={(line, side, body) => addComment(repoPath, login, line, side, body)}
          />
        </div>
      </div>
    </div>
  );
}
