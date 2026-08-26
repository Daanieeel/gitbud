import { useEffect, useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Checkbox } from "@gitbud/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches, useDeleteBranch } from "@/hooks/queries/useBranches";
import { useGitHubStore } from "@/store/useGitHubStore";
import { api } from "@/lib/tauri";
import { isProtectedBranch } from "@/lib/utils";
import type { PullRequest } from "@/lib/types";

export function BranchPruner() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const branches = branchData?.branches ?? [];
  const deleteBranchMutation = useDeleteBranch(repoPath);
  const currentLogin = useGitHubStore((s) => s.currentLogin);

  const [open, setOpen] = useState(false);
  const [merged, setMerged] = useState<PullRequest[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pruning, setPruning] = useState(false);

  useEffect(() => {
    if (!open || !repoPath || !currentLogin) return;
    void api.githubListPullRequests(repoPath, currentLogin, "closed", 1).then((pulls) => {
      setMerged(pulls.filter((p) => p.merged));
    });
  }, [open, repoPath, currentLogin]);

  const candidates = useMemo(() => {
    const mergedRefs = new Set(merged.map((p) => p.head_ref));
    return branches.filter(
      (b) => !b.is_remote && !b.is_head && !isProtectedBranch(b.name) && mergedRefs.has(b.name),
    );
  }, [branches, merged]);

  if (!repoPath || !currentLogin || candidates.length === 0) return null;

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const pruneSelected = async () => {
    setPruning(true);
    try {
      for (const name of selected) {
        await deleteBranchMutation.mutateAsync({ name });
      }
      setSelected(new Set());
      setOpen(false);
    } finally {
      setPruning(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <Trash2Icon className="size-3.5" />
              {candidates.length} merged
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Branches with a merged PR</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b border-border p-2 text-xs text-muted-foreground">
          These branches' pull requests were merged on GitHub.
        </div>
        <div className="max-h-56 overflow-auto p-1">
          {candidates.map((b) => (
            <div
              key={b.name}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => toggle(b.name)}
            >
              <Checkbox
                checked={selected.has(b.name)}
                onClick={(e) => e.stopPropagation()}
                onCheckedChange={() => toggle(b.name)}
              />
              <span className="truncate">{b.name}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button
            size="sm"
            variant="destructive"
            className="w-full"
            disabled={selected.size === 0 || pruning}
            onClick={() => void pruneSelected()}
          >
            <Trash2Icon className="size-3.5" />
            {pruning
              ? "Pruning…"
              : `Prune ${selected.size || ""} Local Branch${selected.size === 1 ? "" : "es"}`}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
