import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckIcon, ExternalLinkIcon, GitBranchIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@gitbud/ui/button";
import { BranchName } from "@gitbud/ui/branch-name";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { Input } from "@gitbud/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { SingleSelectField } from "@/components/pr/SingleSelectField";
import { useIssueRelationships } from "@/hooks/queries/useIssueRelationships";
import {
  useCreateLinkedBranch,
  useDeleteLinkedBranch,
} from "@/hooks/queries/useIssueRelationships";
import { useBranches, useCheckoutBranch } from "@/hooks/queries/useBranches";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { remoteBranchUrl } from "@/lib/remote-provider";
import { api } from "@/lib/tauri";
import type { Issue } from "@/lib/types";

interface IssueSidebarBranchesProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

/** GitHub's "slugify a title for a suggested branch name" convention: lowercase, non-alphanumerics
 * become dashes, collapsed and trimmed. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const CREATE_KEY = "__create__";

/** The Development panel's linked-branches list, plus a "Link or create a branch" select —
 * GitHub's `createLinkedBranch` GraphQL mutation creates the git ref server-side and records the
 * link in one call, so a newly-created branch needs no local git state up front. Once created,
 * it's fetched and checked out locally right away (mirroring the PR tab's own "Checkout" action).
 *
 * Picking an *already-existing* branch from the select is deliberately NOT the same call: GitHub's
 * `createLinkedBranch` only succeeds when the named ref doesn't exist yet — verified live against
 * this repo (calling it with an existing branch's own oid/name returns `linkedBranch: null`, no
 * error, no ref created), so there's no public API to link a pre-existing branch to an issue.
 * Picking one instead just checks it out locally, with a toast pointing at the real GitHub-
 * tracked alternative (referencing "#N" from a PR opened off that branch). */
export function IssueSidebarBranches({ repoPath, login, issue }: IssueSidebarBranchesProps) {
  const { data: relationships } = useIssueRelationships(repoPath, login, issue.number);
  const createLinkedBranch = useCreateLinkedBranch(repoPath, login, issue.number);
  const deleteLinkedBranch = useDeleteLinkedBranch(repoPath, login, issue.number);
  const checkoutBranch = useCheckoutBranch(repoPath);
  const remoteInfo = useRemoteInfo(repoPath);
  const { data: branchData } = useBranches(repoPath);
  const localBranches = branchData?.branches.filter((b) => !b.is_remote) ?? [];
  const defaultBase =
    localBranches.find((b) => b.name === "main" || b.name === "master")?.name ??
    localBranches[0]?.name ??
    "main";
  // Origin branches, remote-prefix stripped and the symbolic `origin/HEAD` excluded — same
  // convention `BranchSwitcher.tsx` already uses for its own remote-branch list.
  const originBranches = useMemo(
    () =>
      (branchData?.branches ?? [])
        .filter((b) => b.is_remote && !b.name.endsWith("/HEAD"))
        .map((b) => b.name.replace(/^[^/]+\//, "")),
    [branchData],
  );

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [base, setBase] = useState(defaultBase);
  const [creating, setCreating] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  // Only reset per-open — `localBranches`/`defaultBase` changing in the background while the
  // dialog is open shouldn't yank the user's edited fields out from under them.
  useEffect(() => {
    if (!open) return;
    setName(`${issue.number}-${slugify(issue.title)}`);
    setBase((prev) => (localBranches.some((b) => b.name === prev) ? prev : defaultBase));
  }, [open]);

  const checkout = async (branchName: string) => {
    setCheckingOut(branchName);
    try {
      await api.gitFetch(repoPath);
      await checkoutBranch.mutateAsync(branchName);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCheckingOut(null);
    }
  };

  const submit = async () => {
    if (!name.trim() || !base) return;
    setCreating(true);
    try {
      const branch = await createLinkedBranch.mutateAsync({ baseBranch: base, name: name.trim() });
      setOpen(false);
      await checkout(branch.name);
    } finally {
      setCreating(false);
    }
  };

  const branches = useMemo(() => relationships?.linked_branches ?? [], [relationships]);
  const linkedNames = useMemo(() => new Set(branches.map((b) => b.name)), [branches]);

  const pick = async (key: string) => {
    if (!key) return;
    if (key === CREATE_KEY) {
      setOpen(true);
      return;
    }
    await checkout(key);
    if (!linkedNames.has(key)) {
      toast.message("Checked out locally, not linked on GitHub", {
        description: `GitHub only supports linking a branch it creates itself. Open a PR from "${key}" that references #${issue.number} (e.g. "Closes #${issue.number}") to link it for real.`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Linked branch</span>

      {branches.map((branch) => (
        <div key={branch.id} className="flex items-center gap-1.5">
          <BranchName className="h-6 min-w-0 flex-1 px-1.5 text-xs">{branch.name}</BranchName>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={checkingOut === branch.name}
                onClick={() => void checkout(branch.name)}
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <GitBranchIcon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {checkingOut === branch.name ? "Checking out…" : "Checkout"}
            </TooltipContent>
          </Tooltip>
          {remoteInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    void openUrl(remoteBranchUrl(remoteInfo.url, remoteInfo.provider, branch.name));
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open on GitHub</TooltipContent>
            </Tooltip>
          )}
          <button
            type="button"
            disabled={deleteLinkedBranch.isPending}
            onClick={() => deleteLinkedBranch.mutate(branch.id)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}

      <SingleSelectField
        placeholder="Link or create a branch…"
        selected=""
        contentClassName="w-[250px]"
        options={[
          {
            key: CREATE_KEY,
            label: "Create branch",
            searchText: "create branch",
            slotLeft: <PlusIcon className="size-3.5 shrink-0 text-accent-green" />,
          },
          ...originBranches.map((name) => ({
            key: name,
            label: name,
            searchText: name,
            slotLeft: linkedNames.has(name) ? (
              <CheckIcon className="size-3.5 shrink-0 text-accent-green" />
            ) : (
              <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ),
          })),
        ]}
        onChange={(key) => void pick(key)}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a branch</DialogTitle>
          </DialogHeader>
          <div className="flex min-w-0 max-w-full flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Branch name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            </div>
            <SingleSelectField
              label="Based on"
              options={localBranches.map((b) => ({ key: b.name, label: b.name }))}
              selected={base}
              onChange={setBase}
              className="min-w-0 max-w-full"
              contentClassName="w-[35ch]"
            />
          </div>
          <DialogFooter>
            <Button disabled={creating || !name.trim()} onClick={() => void submit()}>
              <GitBranchIcon className="size-3.5" />
              {creating ? "Creating…" : "Create branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
