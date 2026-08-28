import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { CloudUploadIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Textarea } from "@gitbud/ui/textarea";
import { CardPicker } from "@gitbud/ui/card-picker";
import { ProviderPicker } from "@gitbud/ui/provider-picker";
import { GitHubMark, GitLabMark, BitbucketMark } from "@gitbud/ui/brand-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gitbud/ui/select";
import { cn } from "@gitbud/ui/utils";
import { useGitHubStore } from "@/store/useGitHubStore";
import { api } from "@/lib/tauri";
import { runGitSync } from "@/lib/gitSync";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import type { RemoteProvider } from "@/lib/remote-provider";

/** Grows with typed content up to 4 lines (max-h-24), then scrolls instead of growing further,
 * and is never manually resizable (the Textarea primitive is already `resize-none`). */
function AutoGrowTextarea({
  value,
  onChange,
  className,
  ...rest
}: ComponentProps<typeof Textarea>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={onChange}
      className={cn("max-h-24 overflow-y-auto", className)}
      {...rest}
    />
  );
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onPublished: () => void;
}

const PROVIDER_OPTIONS = [
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
] satisfies {
  value: RemoteProvider;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}[];

function repoNameFromPath(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? "repository";
}

export function PublishDialog({
  open: isOpen,
  onOpenChange,
  repoPath,
  onPublished,
}: PublishDialogProps) {
  const accounts = useGitHubStore((s) => s.accounts);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const openSignIn = useGitHubStore((s) => s.openSignIn);
  const [provider, setProvider] = useState<RemoteProvider>("github");
  const [login, setLogin] = useState<string | null>(currentLogin);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(repoNameFromPath(repoPath));
    setDescription("");
    setIsPrivate(true);
    setError(null);
    setLogin(currentLogin);
    // Intentionally excludes `currentLogin` — only re-seed the picked account when the dialog
    // is freshly opened, not every time the global "current" GitHub account happens to change.
  }, [isOpen, repoPath]);

  const disabled = !login || !name.trim() || publishing;

  const submit = async () => {
    if (!login || !name.trim()) return;
    setPublishing(true);
    setError(null);
    try {
      const created = await api.githubCreateRepo(
        login,
        name.trim(),
        description.trim() || null,
        isPrivate,
      );
      await runGitSync(repoPath, () => api.gitPublish(repoPath, created.clone_url), {
        description: `Publishing to ${created.full_name}…`,
        doneMessage: `Published to ${created.full_name}`,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.repo(repoPath) });
      onPublished();
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Repository</DialogTitle>
          <DialogDescription>Create a remote repo and push this repo to it.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ProviderPicker value={provider} onChange={setProvider} options={PROVIDER_OPTIONS} />

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border p-4 text-center">
              <p className="text-sm text-muted-foreground">Not signed in to GitHub.</p>
              <Button size="sm" variant="secondary" onClick={openSignIn}>
                Sign in to GitHub
              </Button>
            </div>
          ) : (
            <>
              {accounts.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Account</span>
                  <Select value={login ?? undefined} onValueChange={setLogin}>
                    <SelectTrigger className="w-full border-input bg-accent font-normal hover:bg-accent/80 hover:text-accent-foreground">
                      <SelectValue placeholder="Choose an account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.login} value={a.login}>
                          {a.login}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Repository name <span className="text-destructive">*</span>
                </span>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Description</span>
                <AutoGrowTextarea
                  placeholder="What's this repository about?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={1}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Visibility</span>
                <CardPicker
                  value={isPrivate ? "private" : "public"}
                  onChange={(v) => setIsPrivate(v === "private")}
                  options={[
                    { value: "private", label: "Private", description: "Only you can see it" },
                    {
                      value: "public",
                      label: "Public",
                      description: "Anyone on GitHub can see it",
                    },
                  ]}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          )}
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => void submit()}>
            <CloudUploadIcon className="size-3.5" />
            {publishing ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
