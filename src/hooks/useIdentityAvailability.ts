import { useRepoStore } from "@/store/useRepoStore";
import { useIdentityStore, githubIdentityId, sshIdentityId } from "@/store/useIdentityStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useGitHubStore } from "@/store/useGitHubStore";

/**
 * Whether the currently selected repo has a usable identity for its remote — a non-broken
 * GitHub account for a GitHub remote, or an assigned SSH identity for anything else. Git
 * operations run with GIT_TERMINAL_PROMPT=0 (see git_shell.rs), so without a matching identity
 * fetch/pull/push are guaranteed to fail rather than prompt.
 */
export function useIdentityAvailability(): { available: boolean; reason: string | null } {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const remoteProvider = useRepoStore((s) => s.remoteProvider);
  const repoOverride = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.identity_id ?? null,
  );
  const defaultIdentityId = useSettingsStore((s) => s.settings.default_identity_id);
  const accounts = useGitHubStore((s) => s.accounts);
  const brokenLogin = useGitHubStore((s) => s.brokenLogin);
  const sshIdentities = useIdentityStore((s) => s.sshIdentities);
  const currentLogin = useGitHubStore((s) => s.currentLogin);

  if (!selectedRepo || remoteProvider == null) return { available: true, reason: null };
  const effectiveId =
    repoOverride ?? defaultIdentityId ?? (currentLogin ? githubIdentityId(currentLogin) : null);
  const githubAccount = accounts.find((a) => githubIdentityId(a.login) === effectiveId);
  const sshIdentity = sshIdentities.find((i) => sshIdentityId(i.id) === effectiveId);

  if (remoteProvider === "github") {
    const available = !!githubAccount && githubAccount.login !== brokenLogin;
    return {
      available,
      reason: available
        ? null
        : "No available GitHub identity for this repo. Add or reconnect one in the account switcher",
    };
  }

  const available = !!sshIdentity;
  return {
    available,
    reason: available
      ? null
      : "No SSH identity assigned to this repo. Assign one in the account switcher",
  };
}
