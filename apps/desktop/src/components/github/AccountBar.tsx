import { useEffect, useMemo, useState } from "react";
import {
  DownloadIcon,
  KeyRoundIcon,
  LogInIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { EditorPicker } from "@/components/settings/EditorPicker";
import { CUSTOM_EDITOR_ID } from "@/lib/editors";
import { GitHubMark, GitLabMark, BitbucketMark } from "@gitbud/ui/brand-logo";
import { Badge } from "@gitbud/ui/badge";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { Avatar } from "@gitbud/ui/avatar";
import { useGitHubStore } from "@/store/useGitHubStore";
import {
  useIdentityStore,
  githubIdentityId,
  sshIdentityId,
  type UnifiedIdentity,
} from "@/store/useIdentityStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import type { SshIdentity } from "@/lib/types";
import { AddSshIdentityDialog } from "./AddSshIdentityDialog";
import { EditGitHubIdentityDialog } from "./EditGitHubIdentityDialog";
import { DeviceFlowDialog } from "./DeviceFlowDialog";
import { cn } from "@gitbud/ui/utils";

function IdentityAvatar({ identity }: { identity: UnifiedIdentity }) {
  if (identity.kind === "github") {
    return <Avatar src={identity.avatarUrl} alt="" className="size-6" />;
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
  const startSignIn = useGitHubStore((s) => s.startSignIn);
  const removeAccount = useGitHubStore((s) => s.removeAccount);
  const removeSshIdentity = useIdentityStore((s) => s.removeSshIdentity);
  const setActive = useIdentityStore((s) => s.setActive);
  const accounts = useGitHubStore((s) => s.accounts);
  const brokenLogin = useGitHubStore((s) => s.brokenLogin);
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
      ...sshIdentities.map((i) => ({
        id: sshIdentityId(i.id),
        kind: "ssh" as const,
        label: i.label,
        host: i.host,
        keyPath: i.key_path,
        name: i.name,
        email: i.email,
      })),
    ],
    [accounts, sshIdentities],
  );
  const defaultIdentityId = useSettingsStore((s) => s.settings.default_identity_id);
  const favoriteEditor = useSettingsStore((s) => s.settings.favorite_editor);
  const updateSettings = useSettingsStore((s) => s.update);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const repoOverride = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.identity_id ?? null,
  );
  const clearRepoOverride = useIdentityStore((s) => s.clearRepoOverride);
  const updateStatus = useUpdateStore((s) => s.status);
  const availableUpdate = useUpdateStore((s) => s.update);
  const installUpdate = useUpdateStore((s) => s.install);

  const [sshDialogOpen, setSshDialogOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const [editingSsh, setEditingSsh] = useState<SshIdentity | null>(null);
  const [editingGithubLogin, setEditingGithubLogin] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

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

  const brokenIdentity = identities.find((i) => i.kind === "github" && i.login === brokenLogin);

  const openEdit = (identity: UnifiedIdentity) => {
    if (identity.kind === "github") {
      setEditingGithubLogin(identity.login);
    } else {
      const raw = sshIdentities.find((i) => sshIdentityId(i.id) === identity.id);
      if (raw) setEditingSsh(raw);
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2">
      {!collapsed &&
        (updateStatus === "available" || updateStatus === "installing") &&
        availableUpdate && (
          <button
            type="button"
            disabled={updateStatus === "installing"}
            onClick={() => void installUpdate()}
            className="flex flex-col gap-1 rounded-md border border-accent-yellow/30 bg-accent-yellow/10 p-2.5 text-left text-xs text-accent-yellow transition-colors hover:bg-accent-yellow/15 disabled:cursor-default disabled:opacity-80"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <DownloadIcon
                className={`size-3.5 shrink-0 ${updateStatus === "installing" ? "animate-bounce" : ""}`}
              />
              {updateStatus === "installing"
                ? "Installing update…"
                : `Update available: v${availableUpdate.version}`}
            </span>
            <span className="text-accent-yellow/80">
              {updateStatus === "installing"
                ? "Downloading and installing, app will relaunch."
                : "Click to download and install now."}
            </span>
          </button>
        )}
      {!collapsed && brokenIdentity && (
        <div className="flex flex-col gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <span className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            GitHub sign-in expired
          </span>
          <span>
            Token for <code>{identityLabel(brokenIdentity)}</code> is missing from the system
            keychain. Reconnect to keep using it.
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={reauthing}
            // SAFETY: this button only renders when `brokenIdentity` is truthy, which requires
            // its `login` to have matched `brokenLogin` above — so `brokenLogin` is set here.
            onClick={() => void doReauth(brokenLogin as string)}
          >
            {reauthing ? "Reconnecting…" : "Reconnect GitHub"}
          </Button>
        </div>
      )}
      {!collapsed && !favoriteEditor && (
        <div className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-2.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <SettingsIcon className="size-3.5 shrink-0" />
            No favorite editor set
          </span>
          <span>Choose one to enable "Open in…" from the Changes file explorer.</span>
          <EditorPicker
            onSelect={(editorId, customAppPath) =>
              void updateSettings({
                favorite_editor: editorId,
                custom_editor_command:
                  editorId === CUSTOM_EDITOR_ID ? (customAppPath ?? null) : null,
              })
            }
          >
            <Button size="sm" variant="secondary" className="h-6 px-2 text-xs">
              Choose Editor
            </Button>
          </EditorPicker>
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
              <DropdownMenuItem disabled>
                <BitbucketMark className="size-3.5" />
                Bitbucket
                <Badge className="ml-auto">Coming soon</Badge>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void startSignIn()}>
                <GitHubMark className="size-3.5" />
                GitHub
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <GitLabMark className="size-3.5" />
                GitLab
                <Badge className="ml-auto">Coming soon</Badge>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
                      {current ? (
                        <IdentityAvatar identity={current} />
                      ) : (
                        <LogInIcon className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {current ? identityLabel(current) : "No identity"}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 min-w-0 flex-1 justify-start gap-2"
                >
                  {current && <IdentityAvatar identity={current} />}
                  <span className="truncate">
                    {current ? identityLabel(current) : "No identity"}
                  </span>
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
                  <div className="flex shrink-0 items-center gap-1">
                    {identity.kind === "ssh" &&
                      (!identity.name.trim() || !identity.email.trim()) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex shrink-0 items-center justify-center rounded-md bg-accent-yellow/10 p-1.5 text-accent-yellow">
                              <TriangleAlertIcon className="size-4" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            No commit name/email set — edit to fix commit attribution
                          </TooltipContent>
                        </Tooltip>
                      )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(identity);
                          }}
                        >
                          <PencilIcon className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{`Edit ${identityLabel(identity)}`}</TooltipContent>
                    </Tooltip>
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
                          <XIcon
                            className={cn("size-4", removingId === identity.id && "animate-spin")}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{`Remove ${identityLabel(identity)}`}</TooltipContent>
                    </Tooltip>
                  </div>
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
                    <DropdownMenuItem disabled>
                      <BitbucketMark className="size-3.5" />
                      Bitbucket
                      <Badge className="ml-auto">Coming soon</Badge>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setSwitcherOpen(false);
                        void startSignIn();
                      }}
                    >
                      <GitHubMark className="size-3.5" />
                      GitHub
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      <GitLabMark className="size-3.5" />
                      GitLab
                      <Badge className="ml-auto">Coming soon</Badge>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
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
      <AddSshIdentityDialog open={sshDialogOpen} onOpenChange={setSshDialogOpen} />
      <AddSshIdentityDialog
        open={editingSsh !== null}
        onOpenChange={(next) => {
          if (!next) setEditingSsh(null);
        }}
        identity={editingSsh ?? undefined}
      />
      <EditGitHubIdentityDialog
        open={editingGithubLogin !== null}
        onOpenChange={(next) => {
          if (!next) setEditingGithubLogin(null);
        }}
        account={accounts.find((a) => a.login === editingGithubLogin)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DeviceFlowDialog />
    </div>
  );
}
