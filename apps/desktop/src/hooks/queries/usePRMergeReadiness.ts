import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

/** Required status-check contexts + required-approving-review-count for a base branch — feeds
 * the Checks tab's required/optional grouping and `mergeReadiness()`'s reviews/checks state.
 * Repo+branch-scoped, not PR-scoped (a branch-protection rule applies to every PR targeting that
 * branch), so this is shared across every open PR against the same base. */
export function useBranchProtectionRequirements(
  repoPath: string | null,
  login: string | null,
  branch: string | null,
) {
  return useQuery({
    queryKey: queryKeys.branchProtection(repoPath ?? "", login ?? "", branch ?? ""),
    queryFn: () => api.githubBranchProtectionRequirements(repoPath!, login!, branch!),
    enabled: !!repoPath && !!login && !!branch,
  });
}

/** How far the PR's head has diverged from its base — feeds `mergeReadiness()`'s `behindBy` and
 * the "Update branch" action. Not polled: this only changes when either branch actually moves
 * (a push to either side), which the existing PR-open/refresh flows already re-trigger this on. */
export function useComparePullRequestBase(
  repoPath: string | null,
  login: string | null,
  base: string | null,
  head: string | null,
) {
  return useQuery({
    queryKey: queryKeys.compare(repoPath ?? "", login ?? "", base ?? "", head ?? ""),
    queryFn: () => api.githubComparePullRequestBase(repoPath!, login!, base!, head!),
    enabled: !!repoPath && !!login && !!base && !!head,
  });
}

/** Fast-forwards the PR's head branch onto its base — the merge-readiness panel's "Update
 * branch" action, shown when `mergeReadiness()` reports `behindBy > 0`. */
export function useUpdatePullRequestBranch(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!repoPath || !login || number === null) {
        throw new Error("useUpdatePullRequestBranch: repoPath/login/number not set");
      }
      return api.githubUpdatePullRequestBranch(repoPath, login, number);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.prMeta(repoPath, login, number) });
    },
    onError: (err) => toast.error(String(err)),
  });
}
