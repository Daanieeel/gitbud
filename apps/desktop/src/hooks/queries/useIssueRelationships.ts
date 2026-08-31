import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

/** Parent/blocked-by/blocking (GitHub's newer sub-issues + issue-dependencies GraphQL surface,
 * no REST equivalent exists for either) plus Development-panel linked branches. Not polled — same
 * "rarely changes mid-session" call as the other option lists in `usePRMetadataOptions.ts`; the
 * sidebar re-fetches by invalidating this key after every mutation below instead. */
export function useIssueRelationships(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  return useQuery({
    queryKey: queryKeys.issueRelationships(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: () => api.githubGetIssueRelationships(repoPath!, login!, number!),
    enabled: !!repoPath && !!login && number !== null,
  });
}

function useInvalidateRelationships(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return () => {
    if (!repoPath || !login || number === null) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.issueRelationships(repoPath, login, number),
    });
  };
}

export function useAddSubIssue(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (parentNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddSubIssue: repoPath/login/number not set");
      }
      return api.githubAddSubIssue(repoPath, login, parentNumber, number);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

export function useRemoveSubIssue(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (parentNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useRemoveSubIssue: repoPath/login/number not set");
      }
      return api.githubRemoveSubIssue(repoPath, login, parentNumber, number);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

/** `blockingNumber` is the issue that blocks the current one — pass the numbers swapped to mark
 * the current issue as *blocking* another instead (see `add_blocked_by`'s doc comment). */
export function useAddBlockedBy(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (blockingNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddBlockedBy: repoPath/login/number not set");
      }
      return api.githubAddBlockedBy(repoPath, login, number, blockingNumber);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

export function useRemoveBlockedBy(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (blockingNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useRemoveBlockedBy: repoPath/login/number not set");
      }
      return api.githubRemoveBlockedBy(repoPath, login, number, blockingNumber);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

/** Marks `otherNumber` as blocked by the current issue — the "Mark as blocking" action, which is
 * just `useAddBlockedBy`/`useRemoveBlockedBy` called with the two issue numbers swapped (see
 * `add_blocked_by`'s doc comment for why one backend function covers both directions). Kept as
 * its own hook so the sidebar doesn't have to remember which argument to swap. */
export function useAddBlocking(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (otherNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddBlocking: repoPath/login/number not set");
      }
      return api.githubAddBlockedBy(repoPath, login, otherNumber, number);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

export function useRemoveBlocking(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (otherNumber: number) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useRemoveBlocking: repoPath/login/number not set");
      }
      return api.githubRemoveBlockedBy(repoPath, login, otherNumber, number);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

export function useCreateLinkedBranch(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: ({ baseBranch, name }: { baseBranch: string; name: string }) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useCreateLinkedBranch: repoPath/login/number not set");
      }
      return api.githubCreateLinkedBranch(repoPath, login, number, baseBranch, name);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}

export function useDeleteLinkedBranch(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const invalidate = useInvalidateRelationships(repoPath, login, number);
  return useMutation({
    mutationFn: (linkedBranchId: string) => {
      if (!login) throw new Error("useDeleteLinkedBranch: login not set");
      return api.githubDeleteLinkedBranch(login, linkedBranchId);
    },
    onSuccess: invalidate,
    onError: (err) => toast.error(String(err)),
  });
}
