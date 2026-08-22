import { useEffect, useMemo, useState } from "react";
import { KeyRoundIcon, LogInIcon, MapPinIcon, PlusIcon, SettingsIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { GitHubMark } from "./GitHubMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useIdentityStore, githubIdentityId, sshIdentityId, type UnifiedIdentity } from "@/store/useIdentityStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useRepoStore } from "@/store/useRepoStore";
import { SignInDialog } from "./SignInDialog";
import { AddSshIdentityDialog } from "./AddSshIdentityDialog";
import { cn } from "@/lib/utils";

function IdentityAvatar({ identity }: { identity: UnifiedIdentity }) {
  if (identity.kind === "github") {
    return <img src={identity.avatarUrl} alt="" className="size-6 shrink-0 rounded-full" />;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-yellow/20 text-accent-yellow">
          <KeyRoundIcon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>SSH identity</TooltipContent>
    </Tooltip>
  );
}

function identityLabel(identity: UnifiedIdentity): string {
  return identity.kind === "github" ? identity.login : identity.label;
}

export function AccountBar({ collapsed }: { collapsed?: boolean } = {}) {
  const init = useGitHubStore((s) => s.init);
  const removeAccount = useGitHubStore((s) => s.removeAccount);
  const removeSshIdentity = useIdentityStore((s) => s.removeSshIdentity);
  const setActive = useIdentityStore((s) => s.setActive);
  const accounts = useGitHubStore((s) => s.accounts);
  const brokenLogin = useGitHubStore((s) => s.brokenLogin);
  const signInOpen = useGitHubStore((s) => s.signInOpen);
  const openSignIn = useGitHubStore((s) => s.openSignIn);
  const closeSignIn = useGitHubStore((s) => s.closeSignIn);
  const reauth = useGitHubStore((s) => s.reauth);
  const sshIdentities = useIdentityStore((s) => s.sshIdentities);
  const identities = useMemo<UnifiedIdentity[]>(
    () => [
      ...accounts.map((a) => ({
        id: githubIdentityId(a.login),
        kind: "github" as const,
        login: a.login,
        name: a.name,
        email: a.email,
        avatarUrl: a.avatar_url,
      })),
      ...sshIdentities.map((i) => ({ id: sshIdentityId(i.id), kind: "ssh" as const, label: i.label, host: i.host, keyPath: i.key_path })),
    ],
    [accounts, sshIdentities],
  );
  const defaultIdentityId = useSettingsStore((s) => s.settings.default_identity_id);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const repoOverride = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.identity_id ?? null,
  );
  const clearRepoOverride = useIdentityStore((s) => s.clearRepoOverride);

  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reauthing, setReauthing] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const effectiveId = repoOverride ?? defaultIdentityId;
  const current = identities.find((i) => i.id === effectiveId) ?? identities[0];

  const remove = async (identity: UnifiedIdentity) => {
    setRemovingId(identity.id);
    try {
      if (identity.kind === "github") await removeAccount(identity.login);
      else await removeSshIdentity(identity.id.replace(/^ssh:/, ""));
    } finally {
      setRemovingId(null);
    }
  };

  const doReauth = async (login: string) => {
    setReauthing(true);
    try {
      await reauth(login);
    } finally {
      setReauthing(false);
    }
  };

  const brokenIdentity = identities.find(
    (i) => i.kind === "github" && i.login === brokenLogin,
  );

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2">
      {!collapsed && brokenIdentity && (
        <div className="flex flex-col gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <span className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            GitHub sign-in expired
          </span>
          <span>Token for <code>{identityLabel(brokenIdentity)}</code> is missing from the system keychain. Reconnect to keep using it.</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={reauthing}
            onClick={() => void doReauth(brokenLogin as string)}
          >
            {reauthing ? "Reconnecting…" : "Reconnect GitHub"}
          </Button>
        </div>
      )}
      <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
      {identities.length === 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="secondary" size="icon">
                    <LogInIcon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add identity</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="secondary" size="sm" className="h-9 min-w-0 flex-1">
                <LogInIcon className="size-3.5" />
                Add identity
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={openSignIn}>
              <GitHubMark className="size-3.5" />
              GitHub account
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSshDialogOpen(true)}>
              <KeyRoundIcon className="size-3.5" />
              SSH identity
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex size-9 items-center justify-center rounded-md hover:bg-accent">
                    {current ? <IdentityAvatar identity={current} /> : <LogInIcon className="size-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{current ? identityLabel(current) : "No identity"}</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="secondary" size="sm" className="h-9 min-w-0 flex-1 justify-start gap-2">
                {current && <IdentityAvatar identity={current} />}
                <span className="truncate">{current ? identityLabel(current) : "No identity"}</span>
                {repoOverride && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <MapPinIcon className="size-3 shrink-0 text-accent-yellow" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Pinned to this repo</TooltipContent>
                  </Tooltip>
                )}
              </Button>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-64 p-1" align="start">
            {identities.map((identity) => (
              <div
                key={identity.id}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm hover:bg-accent cursor-pointer",
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "shrink-0 rounded-md bg-accent-yellow/10 p-1.5 text-accent-yellow hover:bg-accent-yellow/20",
                          repoOverride === identity.id && "bg-accent-yellow/25",
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (repoOverride === identity.id) {
                            void clearRepoOverride(selectedRepo);
                          } else {
                            void setActive(identity.id, selectedRepo);
                          }
                          setSwitcherOpen(false);
                        }}
                      >
                        <MapPinIcon className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {repoOverride === identity.id
                        ? `Unpin, and use the global default identity for this repo again`
                        : `Pin ${identityLabel(identity)} to this repo only`}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="shrink-0 rounded-md bg-destructive/10 p-1.5 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                      disabled={removingId !== null}
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(identity);
                      }}
                    >
                      <XIcon className={cn("size-4", removingId === identity.id && "animate-spin")} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{`Remove ${identityLabel(identity)}`}</TooltipContent>
                </Tooltip>
              </div>
            ))}
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
                      openSignIn();
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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="shrink-0"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings</TooltipContent>
      </Tooltip>
      </div>
      <SignInDialog open={signInOpen} onOpenChange={(open) => (open ? openSignIn() : closeSignIn())} />
      <AddSshIdentityDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
