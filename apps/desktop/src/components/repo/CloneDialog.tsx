import { useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadIcon, GlobeIcon, LockIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { ProviderPicker } from "@gitbud/ui/provider-picker";
import { GitHubMark, GitLabMark, BitbucketMark } from "@gitbud/ui/brand-logo";
import { useGitHubStore } from "@/store/useGitHubStore";
import { api } from "@/lib/tauri";
import type { GitHubRepo } from "@/lib/types";
import type { RemoteProvider } from "@/lib/remote-provider";
import { cn } from "@gitbud/ui/utils";
import { isSinglePath } from "@/lib/dialogPaths";
import { DestinationField } from "./DestinationField";
import { ProtocolUrlInput, type CloneProtocol } from "./ProtocolUrlInput";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (url: string, dest: string) => Promise<void>;
}

const PROVIDER_OPTIONS: { value: RemoteProvider; label: string; icon: ReactNode }[] = [
  { value: "github", label: "GitHub", icon: <GitHubMark className="size-4" /> },
  { value: "gitlab", label: "GitLab", icon: <GitLabMark className="size-4" /> },
  { value: "bitbucket", label: "Bitbucket", icon: <BitbucketMark className="size-4" /> },
  { value: "unknown", label: "Custom", icon: <GlobeIcon className="size-4" /> },
];

const PROTOCOL_SCHEME = { https: "https://", ssh: "ssh://" } satisfies Record<
  CloneProtocol,
  string
>;

const PROVIDER_URL_PLACEHOLDER = {
  github: "github.com/owner/repo.git",
  gitlab: "gitlab.com/owner/repo.git",
  bitbucket: "bitbucket.org/owner/repo.git",
  unknown: "host/owner/repo.git",
} satisfies Record<RemoteProvider, string>;

function repoNameFromUrl(url: string): string {
  const trimmed = url
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const segment = trimmed.split(/[/:]/).pop();
  return segment || "repository";
}

export function CloneDialog({ open: isOpen, onOpenChange, onClone }: CloneDialogProps) {
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [provider, setProvider] = useState<RemoteProvider>("github");
  const [selectedRepoUrl, setSelectedRepoUrl] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[] | null>(null);
  const [repoFilter, setRepoFilter] = useState("");
  const [protocol, setProtocol] = useState<CloneProtocol>("https");
  const [customPath, setCustomPath] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [destPath, setDestPath] = useState("");
  const [destEdited, setDestEdited] = useState(false);
  const [cloning, setCloning] = useState(false);

  const hasAccount = provider === "github" && !!currentLogin;

  useEffect(() => {
    if (!isOpen || !hasAccount) return;
    void api.githubListUserRepos(currentLogin!).then(setRepos, () => setRepos([]));
  }, [isOpen, hasAccount, currentLogin]);

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    if (!repoFilter.trim()) return repos;
    const needle = repoFilter.toLowerCase();
    return repos.filter((r) => r.full_name.toLowerCase().includes(needle));
  }, [repos, repoFilter]);

  const url = hasAccount
    ? selectedRepoUrl
    : customPath.trim()
      ? `${PROTOCOL_SCHEME[protocol]}${customPath.trim()}`
      : "";

  const suggestedName = repoNameFromUrl(url || "repository");
  useEffect(() => {
    if (parentDir && !destEdited) setDestPath(`${parentDir}/${suggestedName}`);
  }, [parentDir, suggestedName, destEdited]);

  const disabled = !url.trim() || !destPath.trim() || cloning;

  const pickParentDir = async () => {
    const dir = await open({ directory: true, title: "Choose a folder to clone into" });
    if (!isSinglePath(dir)) return;
    setParentDir(dir);
    setDestEdited(false);
  };

  const submit = async () => {
    if (!destPath.trim()) return;
    setCloning(true);
    try {
      await onClone(url.trim(), destPath.trim());
      setSelectedRepoUrl("");
      setCustomPath("");
      setParentDir(null);
      setDestPath("");
      setDestEdited(false);
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
          <DialogDescription>Pick a provider, then choose a repo or paste a URL.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ProviderPicker value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} />

          {hasAccount ? (
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
                      selectedRepoUrl === r.clone_url && "bg-accent",
                    )}
                    onClick={() => setSelectedRepoUrl(r.clone_url)}
                  >
                    {r.private && <LockIcon className="size-3 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{r.full_name}</span>
                    {r.fork && <span className="shrink-0 text-xs text-muted-foreground">fork</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {provider !== "unknown" && (
                <p className="text-xs text-muted-foreground">
                  {provider === "github" ? "Not signed in to GitHub." : "Not connected."} Paste a
                  repository URL below.
                </p>
              )}
              <ProtocolUrlInput
                protocol={protocol}
                onProtocolChange={setProtocol}
                path={customPath}
                onPathChange={setCustomPath}
                placeholder={PROVIDER_URL_PLACEHOLDER[provider]}
              />
            </div>
          )}

          <DestinationField
            value={destPath}
            onChange={(v) => {
              setDestPath(v);
              setDestEdited(true);
            }}
            onBrowse={() => void pickParentDir()}
            placeholder="Destination folder"
          />
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
