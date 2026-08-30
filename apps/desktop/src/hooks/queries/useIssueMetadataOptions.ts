import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { Issue } from "@/lib/types";

// Mutation halves only — the read-only repo-scoped option lists (`useLabels`, `useAssignableUsers`,
// `useMilestones`, `useProjects`) live in usePRMetadataOptions.ts and are reused directly, since
// they're already issue-agnostic (labels/assignees/milestones/projects aren't PR-specific).

/** Mirrors `diff` from usePRMetadataOptions.ts. */
function diff(prev: string[], next: string[]) {
  return {
    added: next.filter((k) => !prev.includes(k)),
    removed: prev.filter((k) => !next.includes(k)),
  };
}

function patchIssueMeta(
  queryClient: ReturnType<typeof useQueryClient>,
  repoPath: string,
  login: string,
  number: number,
  patch: (issue: Issue) => Issue,
) {
  queryClient.setQueryData<Issue | undefined>(
    queryKeys.issueMeta(repoPath, login, number),
    (prev) => (prev ? patch(prev) : prev),
  );
  void queryClient.invalidateQueries({ queryKey: queryKeys.issueMeta(repoPath, login, number) });
}

export function useSyncIssueLabels(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string[]) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSyncIssueLabels: repoPath/login/number not set");
      }
      const prevIssue = queryClient.getQueryData<Issue>(
        queryKeys.issueMeta(repoPath, login, number),
      );
      const { added, removed } = diff(prevIssue?.labels ?? [], next);
      await Promise.all([
        added.length > 0 ? api.githubAddLabels(repoPath, login, number, added) : Promise.resolve(),
        ...removed.map((name) => api.githubRemoveLabel(repoPath, login, number, name)),
      ]);
      return next;
    },
    onSuccess: (next) => {
      if (!repoPath || !login || number === null) return;
      patchIssueMeta(queryClient, repoPath, login, number, (issue) => ({
        ...issue,
        labels: next,
      }));
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useSyncIssueAssignees(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (next: string[]) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSyncIssueAssignees: repoPath/login/number not set");
      }
      const prevIssue = queryClient.getQueryData<Issue>(
        queryKeys.issueMeta(repoPath, login, number),
      );
      const prevLogins = prevIssue?.assignees.map((a) => a.login) ?? [];
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueMeta(repoPath, login, number),
      });
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** `SingleSelectField`'s `onChange` gives `""` for "cleared" — routes to the clear-milestone
 * endpoint instead of set, mirroring `useSetMilestone`. */
export function useSetIssueMilestone(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (milestoneKey: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSetIssueMilestone: repoPath/login/number not set");
      }
      return milestoneKey
        ? api.githubSetMilestone(repoPath, login, number, Number(milestoneKey))
        : api.githubClearMilestone(repoPath, login, number);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.issueMeta(repoPath, login, number),
      });
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useAddIssueToProject(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  return useMutation({
    mutationFn: (projectId: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddIssueToProject: repoPath/login/number not set");
      }
      return api.githubAddIssueToProject(repoPath, login, number, projectId);
    },
    onError: (err) => toast.error(String(err)),
  });
}
