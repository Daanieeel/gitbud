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
import { isProtectedBranch, isWhitespaceOnlyDiff } from "@/lib/utils";
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
  // Tracks whether `summary` currently holds text we generated (vs. the user's own words), so
  // the staged-set effect below knows it's safe to replace or clear it.
  const [summaryAutoFilled, setSummaryAutoFilled] = useState(false);
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

  // Pre-fill a sensible summary for the common single-file-change case, without ever touching
  // a message the user typed themselves. Only text we generated (summaryAutoFilled) gets
  // replaced or cleared when the staged set changes underneath it.
  useEffect(() => {
    if (amending) return;
    if (summary.trim() && !summaryAutoFilled) return;

    if (stagedFiles.length !== 1 || !repoPath) {
      if (summaryAutoFilled) {
        setSummary("");
        setSummaryAutoFilled(false);
      }
      return;
    }

    const file = stagedFiles[0];
    const name = file.path.split("/").pop();
    const fill = (text: string) => {
      setSummary(text);
      setSummaryAutoFilled(true);
    };

    if (file.status === "added" || file.status === "untracked") {
      fill(`Create ${name}`);
      return;
    }
    if (file.status === "deleted") {
      fill(`Delete ${name}`);
      return;
    }
    if (file.status === "renamed") {
      fill(`Move ${name}`);
      return;
    }

    // Modified/type-changed: fetch the staged diff to tell a pure reformat ("Format") apart
    // from a real content edit ("Update").
    let cancelled = false;
    void api
      .getFileDiff(repoPath, file.path, true)
      .then((diff) => {
        if (cancelled) return;
        fill(isWhitespaceOnlyDiff(diff) ? `Format ${name}` : `Update ${name}`);
      })
      .catch(() => {
        if (!cancelled) fill(`Update ${name}`);
      });
    return () => {
      cancelled = true;
    };
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
    setSummaryAutoFilled(false);
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
        onChange={(e) => {
          setSummary(e.target.value);
          setSummaryAutoFilled(false);
        }}
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
