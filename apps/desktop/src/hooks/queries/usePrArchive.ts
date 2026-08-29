import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

/** Whether this PR is archived — a gitbud-only bookkeeping flag with no GitHub equivalent (see
 * `pr_cache::is_pr_archived`'s Rust-side doc comment), purely local and never synced. */
export function useIsPrArchived(repoPath: string | null, number: number | null) {
  return useQuery({
    queryKey: queryKeys.prArchived(repoPath ?? "", number ?? -1),
    queryFn: () => api.getPrArchived(repoPath!, number!),
    enabled: !!repoPath && number !== null,
  });
}

export function useSetPrArchived(repoPath: string | null, number: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => {
      if (!repoPath || number === null) {
        throw new Error("useSetPrArchived: repoPath/number not set");
      }
      return api.setPrArchived(repoPath, number, archived);
    },
    onSuccess: (_void, archived) => {
      if (!repoPath || number === null) return;
      queryClient.setQueryData(queryKeys.prArchived(repoPath, number), archived);
    },
    onError: (err) => toast.error(String(err)),
  });
}
