import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadIcon, FolderOpenIcon, LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGitHubStore } from "@/store/useGitHubStore";
import { api } from "@/lib/tauri";
import type { GitHubRepo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (url: string, dest: string) => Promise<void>;
}

function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const segment = trimmed.split(/[/:]/).pop();
  return segment || "repository";
}

export function CloneDialog({ open: isOpen, onOpenChange, onClone }: CloneDialogProps) {
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [repoFilter, setRepoFilter] = useState("");

  useEffect(() => {
    if (!isOpen || !currentLogin) return;
    void api.githubListUserRepos(currentLogin).then(setRepos, () => setRepos([]));
  }, [isOpen, currentLogin]);

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    if (!repoFilter.trim()) return repos;
    const needle = repoFilter.toLowerCase();
    return repos.filter((r) => r.full_name.toLowerCase().includes(needle));
  }, [repos, repoFilter]);

  const dest = parentDir ? `${parentDir}/${repoNameFromUrl(url)}` : null;
  const disabled = !url.trim() || !dest || cloning;

  const pickParentDir = async () => {
    const dir = await open({ directory: true, title: "Choose a folder to clone into" });
    if (typeof dir === "string") setParentDir(dir);
  };

  const submit = async () => {
    if (!dest) return;
    setCloning(true);
    try {
      await onClone(url.trim(), dest);
      setUrl("");
      setParentDir(null);
      onOpenChange(false);
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
          <DialogDescription>
            {currentLogin ? "Pick one of your repos, or paste a URL." : "Clone a repository from a URL."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {currentLogin && (
            <div className="flex flex-col gap-1">
              <Input
                placeholder="Search your repositories"
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                className="h-7"
              />
              <div className="max-h-40 overflow-auto rounded-md border border-border">
                {repos === null && (
                  <div className="p-2 text-center text-xs text-muted-foreground">Loading…</div>
                )}
                {repos !== null && filteredRepos.length === 0 && (
                  <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
                )}
                {filteredRepos.map((r) => (
                  <div
                    key={r.full_name}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent",
                      url === r.clone_url && "bg-accent",
                    )}
                    onClick={() => setUrl(r.clone_url)}
                  >
                    {r.private && <LockIcon className="size-3 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{r.full_name}</span>
                    {r.fork && <span className="shrink-0 text-xs text-muted-foreground">fork</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <Input
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void pickParentDir()}>
              <FolderOpenIcon className="size-3.5" />
              Choose Folder
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {dest ?? "No destination chosen"}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => void submit()}>
            <DownloadIcon className="size-3.5" />
            {cloning ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
