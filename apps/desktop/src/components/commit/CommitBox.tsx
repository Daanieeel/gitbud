import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GitCommitIcon, ShieldIcon, TriangleAlertIcon, Undo2Icon, XIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Textarea } from "@gitbud/ui/textarea";
import { Checkbox } from "@gitbud/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useStatus } from "@/hooks/queries/useRepoStatus";
import { useCommitLog } from "@/hooks/queries/useCommitLog";
import { useAheadBehind, DEFAULT_AHEAD_BEHIND } from "@/hooks/queries/useAheadBehind";
import { useCommit, useAmendCommit, useUndoLastCommit } from "@/hooks/queries/useCommitActions";
import { cn } from "@gitbud/ui/utils";
import { isProtectedBranch } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useBusyAction } from "@/hooks/useBusyAction";
import { api } from "@/lib/tauri";
import { SigningSetupDialog } from "@/components/settings/SigningSetupDialog";

export function CommitBox() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const branch = branchData?.branch ?? null;
  const { data: status } = useStatus(repoPath);
  const { commits } = useCommitLog(repoPath);
  const { data: aheadBehind = DEFAULT_AHEAD_BEHIND } = useAheadBehind(repoPath);
  const summary = useRepoStore((s) => s.commitSummary);
  const description = useRepoStore((s) => s.commitDescription);
  const amending = useRepoStore((s) => s.amending);
  const setSummary = useRepoStore((s) => s.setCommitSummary);
  const setDescription = useRepoStore((s) => s.setCommitDescription);
  const setAmending = useRepoStore((s) => s.setAmending);
  const commitMutation = useCommit(repoPath);
  const amendCommitMutation = useAmendCommit(repoPath);
  const undoLastCommitMutation = useUndoLastCommit(repoPath);

  const [committing, runCommit] = useBusyAction();
  const [undoing, runUndo] = useBusyAction();
  const [signingEnabled, setSigningEnabled] = useState(true);
  const [signingBannerDismissed, setSigningBannerDismissed] = useState(false);
  const [signingDialogOpen, setSigningDialogOpen] = useState(false);
  const [gitIdentity, setGitIdentity] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });
  const stagedFiles = status?.files.filter((f) => f.staged) ?? [];
  const hasStagedChanges = stagedFiles.length > 0;
  const lastCommit = commits[0];
  // `head_on_remote` (not just `published`/`ahead`) so a freshly branched-off commit that
  // was already pushed on its parent branch doesn't show up here as "unpushed" just because
  // this new branch itself has no upstream yet.
  const hasUnpushedCommit = !!lastCommit && !aheadBehind.head_on_remote;

  // Pre-fill a sensible summary for the common single-file-change case, without
  // clobbering anything the user has already typed.
  useEffect(() => {
    if (summary.trim() || amending) return;
    if (stagedFiles.length === 1) {
      const name = stagedFiles[0].path.split("/").pop();
      setSummary(`Update ${name}`);
    }
    // Only re-run when the staged set changes, not on every keystroke.
  }, [stagedFiles.map((f) => f.path).join("|")]);

  useEffect(() => {
    if (!repoPath) return;
    void api.getSigningStatus(repoPath).then((s) => setSigningEnabled(s.enabled));
    void api.getGitIdentity(repoPath).then(([name, email]) => {
      setGitIdentity({ name: name ?? "", email: email ?? "" });
    });
  }, [repoPath]);

  const toggleAmend = (next: boolean) => {
    setAmending(next);
    if (next && lastCommit) {
      setSummary(lastCommit.summary);
    } else if (!next) {
      setSummary("");
      setDescription("");
    }
  };

  const disabled = amending
    ? summary.trim().length === 0
    : !hasStagedChanges || summary.trim().length === 0;

  const submit = async () => {
    if (disabled || committing) return;
    await runCommit(async () => {
      const trimmedSummary = summary.trim();
      const trimmedDescription = description.trim();
      if (amending) {
        await amendCommitMutation.mutateAsync({
          summary: trimmedSummary,
          description: trimmedDescription,
        });
        setSummary("");
        setDescription("");
        setAmending(false);
        void notify(`Amended commit on ${branch ?? "current branch"}`, trimmedSummary);
      } else {
        await commitMutation.mutateAsync({
          summary: trimmedSummary,
          description: trimmedDescription,
        });
        const fileWord = stagedFiles.length === 1 ? "file" : "files";
        setSummary("");
        setDescription("");
        void notify(
          `Committed ${stagedFiles.length} ${fileWord} to ${branch ?? "current branch"}`,
          trimmedSummary,
        );
      }
    });
  };

  const protectedWarning = branch && isProtectedBranch(branch);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={amending}
              disabled={!lastCommit}
              onCheckedChange={(checked) => toggleAmend(checked === true)}
            />
            Amend last commit
          </label>
        </TooltipTrigger>
        <TooltipContent>
          Replace the last commit with this message and add the current changes to it
        </TooltipContent>
      </Tooltip>
      <Input
        placeholder="Summary (required)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        autoComplete="off"
      />
      <Textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        autoComplete="off"
      />
      {protectedWarning && (
        <div className="flex items-center gap-1.5 rounded-md bg-accent-yellow/10 px-2 py-1 text-xs text-accent-yellow">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          You're committing directly to {branch}
        </div>
      )}
      <SigningSetupDialog
        open={signingDialogOpen}
        onOpenChange={(next) => {
          setSigningDialogOpen(next);
          if (!next && repoPath)
            void api.getSigningStatus(repoPath).then((s) => setSigningEnabled(s.enabled));
        }}
        repoPath={repoPath}
        name={gitIdentity.name}
        email={gitIdentity.email}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="w-full"
            disabled={disabled || committing}
            onClick={() => void submit()}
          >
            <GitCommitIcon className={cn("size-3.5", committing && "animate-spin")} />
            <span className="min-w-0 truncate">
              {committing
                ? amending
                  ? "Amending…"
                  : "Committing…"
                : amending
                  ? `Amend Last Commit on ${branch ?? "…"}`
                  : `Commit to ${branch ?? "…"}`}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {amending
            ? "Rewrite the last commit with this message and any staged changes"
            : "Cmd+Enter"}
        </TooltipContent>
      </Tooltip>
      {!signingEnabled && !signingBannerDismissed && (
        <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <ShieldIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">Commits aren't signed</span>
          <button
            className="shrink-0 font-medium text-foreground hover:underline"
            onClick={() => setSigningDialogOpen(true)}
          >
            Set up
          </button>
          <button
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => setSigningBannerDismissed(true)}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
      {hasUnpushedCommit && (
        <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <GitCommitIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={lastCommit.summary}>
            {lastCommit.summary}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 shrink-0 px-1.5"
            disabled={undoing}
            onClick={() =>
              void runUndo(async () => {
                let restoredSummary: string, restoredDescription: string;
                try {
                  [restoredSummary, restoredDescription] =
                    await undoLastCommitMutation.mutateAsync();
                } catch (err) {
                  toast.error(String(err));
                  return;
                }
                setSummary(restoredSummary);
                setDescription(restoredDescription);
                setAmending(false);
              })
            }
          >
            <Undo2Icon className={cn("size-3.5", undoing && "animate-spin")} />
            Undo
          </Button>
        </div>
      )}
    </div>
  );
}
