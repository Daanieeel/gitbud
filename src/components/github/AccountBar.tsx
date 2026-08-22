import { useEffect, useState } from "react";
import { KeyRoundIcon, MapPinIcon, PlusIcon, XIcon } from "lucide-react";
import { GitHubMark } from "./GitHubMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useIdentityStore, type UnifiedIdentity } from "@/store/useIdentityStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useRepoStore } from "@/store/useRepoStore";
import { SignInDialog } from "./SignInDialog";
import { AddSshIdentityDialog } from "./AddSshIdentityDialog";
import { cn } from "@/lib/utils";

function IdentityAvatar({ identity }: { identity: UnifiedIdentity }) {
  if (identity.kind === "github") {
    return <img src={identity.avatarUrl} alt="" className="size-4 shrink-0 rounded-full" />;
  }
  return (
    <span
      title="SSH identity"
      className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-yellow/20 text-accent-yellow"
    >
      <KeyRoundIcon className="size-3" />
    </span>
  );
}

function identityLabel(identity: UnifiedIdentity): string {
  return identity.kind === "github" ? identity.login : identity.label;
}

export function AccountBar() {
  const init = useGitHubStore((s) => s.init);
  const removeAccount = useGitHubStore((s) => s.removeAccount);
  const removeSshIdentity = useIdentityStore((s) => s.removeSshIdentity);
  const setActive = useIdentityStore((s) => s.setActive);
  const identities = useIdentityStore((s) => s.list());
  const defaultIdentityId = useSettingsStore((s) => s.settings.default_identity_id);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const repoOverride = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.identity_id ?? null,
  );
  const clearRepoOverride = useIdentityStore((s) => s.clearRepoOverride);

  const [signInOpen, setSignInOpen] = useState(false);
  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const effectiveId = repoOverride ?? defaultIdentityId;
  const current = identities.find((i) => i.id === effectiveId) ?? identities[0];

  const remove = (identity: UnifiedIdentity) => {
    if (identity.kind === "github") void removeAccount(identity.login);
    else void removeSshIdentity(identity.id.replace(/^ssh:/, ""));
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
      {identities.length === 0 ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setSignInOpen(true)}>
          <GitHubMark className="size-3.5" />
          Sign in with GitHub
        </Button>
      ) : (
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              {current && <IdentityAvatar identity={current} />}
              <span className="truncate">{current ? identityLabel(current) : "No identity"}</span>
              {repoOverride && (
                <span title="Pinned to this repo">
                  <MapPinIcon className="size-3 shrink-0 text-accent-yellow" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="start">
            {identities.map((identity) => (
              <div
                key={identity.id}
                className={cn(
                  "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                  effectiveId === identity.id && "bg-accent",
                )}
                onClick={() => {
                  void setActive(identity.id);
                  setSwitcherOpen(false);
                }}
              >
                <IdentityAvatar identity={identity} />
                <span className="min-w-0 flex-1 truncate">
                  {identityLabel(identity)}
                  {identity.kind === "ssh" && (
                    <span className="ml-1 text-xs text-muted-foreground">{identity.host}</span>
                  )}
                </span>
                {selectedRepo && (
                  <button
                    title={`Use ${identityLabel(identity)} only for this repo`}
                    className={cn(
                      "shrink-0 text-muted-foreground hover:text-accent-yellow",
                      repoOverride === identity.id ? "opacity-100 text-accent-yellow" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      void setActive(identity.id, selectedRepo);
                      setSwitcherOpen(false);
                    }}
                  >
                    <MapPinIcon className="size-3.5" />
                  </button>
                )}
                <button
                  title="Remove"
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(identity);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
            {repoOverride && selectedRepo && (
              <button
                className="mt-1 w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  void clearRepoOverride(selectedRepo);
                  setSwitcherOpen(false);
                }}
              >
                Clear pin — use global default for this repo
              </button>
            )}
            <div className="mt-1 border-t border-border pt-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    <PlusIcon className="size-3.5" />
                    Add account
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onSelect={() => {
                      setSwitcherOpen(false);
                      setSignInOpen(true);
                    }}
                  >
                    <GitHubMark className="size-3.5" />
                    GitHub account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setSwitcherOpen(false);
                      setSshDialogOpen(true);
                    }}
                  >
                    <KeyRoundIcon className="size-3.5" />
                    SSH identity
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
      <AddSshIdentityDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />
    </div>
  );
}
