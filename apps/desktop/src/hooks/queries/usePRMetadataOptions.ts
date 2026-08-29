import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { PullRequest } from "@/lib/types";

// Repo-scoped (not PR-scoped) — promoted out of CreatePRDialog.tsx's ad hoc per-open fetch since
// the sidebar now needs these on every PR open, not just when creating one. Not polled: labels/
// assignable-users/milestones/projects rarely change mid-session, so a force-invalidate whenever
// the sidebar is opened/expanded (the caller's responsibility) is enough to avoid ever showing a
// genuinely stale option list without paying for a poll loop nothing needs.

export function useLabels(repoPath: string | null, login: string | null) {
  return useQuery({
    queryKey: queryKeys.prLabels(repoPath ?? "", login ?? ""),
    queryFn: () => api.githubListLabels(repoPath!, login!),
    enabled: !!repoPath && !!login,
  });
}

export function useAssignableUsers(repoPath: string | null, login: string | null) {
  return useQuery({
    queryKey: queryKeys.assignableUsers(repoPath ?? "", login ?? ""),
    queryFn: () => api.githubListAssignableUsers(repoPath!, login!),
    enabled: !!repoPath && !!login,
  });
}

export function useMilestones(repoPath: string | null, login: string | null) {
  return useQuery({
    queryKey: queryKeys.milestones(repoPath ?? "", login ?? ""),
    queryFn: () => api.githubListMilestones(repoPath!, login!),
    enabled: !!repoPath && !!login,
  });
}

export function useProjects(repoPath: string | null, login: string | null) {
  return useQuery({
    queryKey: queryKeys.projects(repoPath ?? "", login ?? ""),
    // GitHub Projects (v2) is GraphQL-only and errors on repos it isn't enabled for — degrade to
    // an empty list rather than surfacing an error toast for a feature most repos don't use,
    // mirroring CreatePRDialog's existing `.catch(() => setProjects([]))` handling.
    queryFn: () => api.githubListProjects(repoPath!, login!).catch(() => []),
    enabled: !!repoPath && !!login,
  });
}

export function useRepoTeams(repoPath: string | null, login: string | null) {
  return useQuery({
    queryKey: queryKeys.repoTeams(repoPath ?? "", login ?? ""),
    // A personal-account repo (no org, so no teams at all) 404s/403s here depending on host —
    // degrade to "no teams" rather than an error toast, mirroring `useProjects`.
    queryFn: () => api.githubListRepoTeams(repoPath!, login!).catch(() => []),
    enabled: !!repoPath && !!login,
  });
}

/** `MultiSelectField`'s `selected`/`onChange` only carry one flat `string[]`, so a team reviewer
 * is distinguished from a user reviewer by this key prefix rather than a second array — kept in
 * one place so the sidebar's picker and `useSyncReviewers`'s diffing agree on the convention. */
export const TEAM_REVIEWER_PREFIX = "team:";
export function teamReviewerKey(slug: string): string {
  return `${TEAM_REVIEWER_PREFIX}${slug}`;
}

export function useIssueStates(repoPath: string | null, login: string | null, numbers: number[]) {
  return useQuery({
    queryKey: queryKeys.issueStates(repoPath ?? "", login ?? "", numbers),
    queryFn: () => api.githubListIssueStates(repoPath!, login!, numbers),
    enabled: !!repoPath && !!login && numbers.length > 0,
  });
}

function patchPrMeta(
  queryClient: ReturnType<typeof useQueryClient>,
  repoPath: string,
  login: string,
  number: number,
  patch: (pr: PullRequest) => PullRequest,
) {
  queryClient.setQueryData<PullRequest | undefined>(
    queryKeys.prMeta(repoPath, login, number),
    (prev) => (prev ? patch(prev) : prev),
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.prMeta(repoPath, login, number) });
}

/** `MultiSelectField.onChange` fires with the *full* next selection on every toggle, not a delta
 * — this diffs it against whatever's currently cached to decide what actually needs an add call
 * vs a remove call. GitHub's add/remove endpoints for labels, assignees, and requested reviewers
 * are each their own direction (a POST only ever adds, never replaces), so a naive "just POST the
 * new full array" would silently never remove anything the user unchecked. */
function diff(prev: string[], next: string[]) {
  return {
    added: next.filter((k) => !prev.includes(k)),
    removed: prev.filter((k) => !next.includes(k)),
  };
}

export function useSyncLabels(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string[]) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSyncLabels: repoPath/login/number not set");
      }
      const prevPr = queryClient.getQueryData<PullRequest>(
        queryKeys.prMeta(repoPath, login, number),
      );
      const { added, removed } = diff(prevPr?.labels ?? [], next);
      await Promise.all([
        added.length > 0 ? api.githubAddLabels(repoPath, login, number, added) : Promise.resolve(),
        ...removed.map((name) => api.githubRemoveLabel(repoPath, login, number, name)),
      ]);
      return next;
    },
    onSuccess: (next) => {
      if (!repoPath || !login || number === null) return;
      patchPrMeta(queryClient, repoPath, login, number, (pr) => ({ ...pr, labels: next }));
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useSyncAssignees(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string[]) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSyncAssignees: repoPath/login/number not set");
      }
      const prevPr = queryClient.getQueryData<PullRequest>(
        queryKeys.prMeta(repoPath, login, number),
      );
      const prevLogins = prevPr?.assignees.map((a) => a.login) ?? [];
      const { added, removed } = diff(prevLogins, next);
      await Promise.all([
        added.length > 0
          ? api.githubAddAssignees(repoPath, login, number, added)
          : Promise.resolve(),
        removed.length > 0
          ? api.githubRemoveAssignees(repoPath, login, number, removed)
          : Promise.resolve(),
      ]);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.prMeta(repoPath, login, number) });
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** Splits a flat `MultiSelectField` selection back into plain user logins and team slugs, per
 * the `TEAM_REVIEWER_PREFIX` convention above. */
function splitReviewerKeys(keys: string[]) {
  const users: string[] = [];
  const teams: string[] = [];
  for (const key of keys) {
    if (key.startsWith(TEAM_REVIEWER_PREFIX)) teams.push(key.slice(TEAM_REVIEWER_PREFIX.length));
    else users.push(key);
  }
  return { users, teams };
}

export function useSyncReviewers(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string[]) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSyncReviewers: repoPath/login/number not set");
      }
      const prevPr = queryClient.getQueryData<PullRequest>(
        queryKeys.prMeta(repoPath, login, number),
      );
      const prevKeys = [
        ...(prevPr?.requested_reviewers.map((r) => r.login) ?? []),
        ...(prevPr?.requested_teams.map((t) => teamReviewerKey(t.slug)) ?? []),
      ];
      const { added, removed } = diff(prevKeys, next);
      const addedSplit = splitReviewerKeys(added);
      const removedSplit = splitReviewerKeys(removed);
      await Promise.all([
        addedSplit.users.length > 0 || addedSplit.teams.length > 0
          ? api.githubRequestReviewers(repoPath, login, number, addedSplit.users, addedSplit.teams)
          : Promise.resolve(),
        removedSplit.users.length > 0 || removedSplit.teams.length > 0
          ? api.githubRemoveRequestedReviewers(
              repoPath,
              login,
              number,
              removedSplit.users,
              removedSplit.teams,
            )
          : Promise.resolve(),
      ]);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.prMeta(repoPath, login, number) });
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** `SingleSelectField`'s `onChange` gives `""` for "cleared" — that's not a valid milestone
 * number, so it routes to the separate clear-milestone endpoint instead of set. */
export function useSetMilestone(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (milestoneKey: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSetMilestone: repoPath/login/number not set");
      }
      return milestoneKey
        ? api.githubSetMilestone(repoPath, login, number, Number(milestoneKey))
        : api.githubClearMilestone(repoPath, login, number);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.prMeta(repoPath, login, number) });
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useAddToProject(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  return useMutation({
    mutationFn: (projectId: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddToProject: repoPath/login/number not set");
      }
      return api.githubAddPullRequestToProject(repoPath, login, number, projectId);
    },
    onError: (err) => toast.error(String(err)),
  });
}
