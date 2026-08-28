import { useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadIcon, GlobeIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
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
import { isSinglePath } from "@/lib/dialogPaths";
import { DestinationField } from "./DestinationField";
import { ProtocolUrlInput, type CloneProtocol } from "./ProtocolUrlInput";
import { RepoPickerList, type RepoListEntry } from "./RepoPickerList";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (url: string, dest: string) => Promise<void>;
}

const PROVIDER_OPTIONS: {
  value: RemoteProvider;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}[] = [
  { value: "github", label: "GitHub", icon: <GitHubMark className="size-4" /> },
  {
    value: "gitlab",
    label: "GitLab",
    icon: <GitLabMark className="size-4" />,
    disabled: true,
    disabledReason: "Coming soon",
  },
  {
    value: "bitbucket",
    label: "Bitbucket",
    icon: <BitbucketMark className="size-4" />,
    disabled: true,
    disabledReason: "Coming soon",
  },
  { value: "unknown", label: "Custom", icon: <GlobeIcon className="size-4" /> },
];

function toRepoListEntry(r: GitHubRepo): RepoListEntry {
  return {
    cloneUrl: r.clone_url,
    ownerLogin: r.owner.login,
    repoName: r.full_name.slice(r.owner.login.length + 1),
    avatarUrl: r.owner.avatar_url,
    private: r.private,
    fork: r.fork,
  };
}

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

  const repoEntries = useMemo(() => (repos ? repos.map(toRepoListEntry) : null), [repos]);

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
            <RepoPickerList
              entries={repoEntries}
              filter={repoFilter}
              onFilterChange={setRepoFilter}
              selectedUrl={selectedRepoUrl}
              onSelect={setSelectedRepoUrl}
              searchPlaceholder="Search your repositories"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              {provider === "github" && (
                <p className="text-xs text-muted-foreground">
                  Not signed in to GitHub. Paste a repository URL below.
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
