import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DiffView } from "@/components/diff/DiffView";
import { CIBadge } from "./CIBadge";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import type { PullRequest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";

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
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            void openUrl(pr.html_url);
          }}
          title="Open on GitHub"
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
        <Button variant="outline" size="sm" disabled={checkingOut} onClick={() => void checkout()}>
          {checkingOut ? "Checking out…" : "Checkout"}
        </Button>
        {!pr.merged && pr.state === "open" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" disabled={merging}>
                {merging ? "Merging…" : "Merge"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void merge("merge")}>Create merge commit</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void merge("squash")}>Squash and merge</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void merge("rebase")}>Rebase and merge</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0 overflow-auto border-r border-border">
          {files.map((f) => (
            <div
              key={f.filename}
              className={cn(
                "cursor-pointer truncate px-2 py-1 text-sm hover:bg-accent",
                selectedFilePath === f.filename && "bg-accent",
              )}
              title={`${f.filename} (${f.status})`}
              onClick={() => selectFile(f.filename)}
            >
              {f.filename}
            </div>
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
