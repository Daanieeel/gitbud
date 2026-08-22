import { useEffect } from "react";
import { GitCommitIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { isProtectedBranch } from "@/lib/utils";

export function CommitBox() {
  const branch = useRepoStore((s) => s.branch);
  const status = useRepoStore((s) => s.status);
  const commits = useRepoStore((s) => s.commits);
  const summary = useRepoStore((s) => s.commitSummary);
  const description = useRepoStore((s) => s.commitDescription);
  const amending = useRepoStore((s) => s.amending);
  const setSummary = useRepoStore((s) => s.setCommitSummary);
  const setDescription = useRepoStore((s) => s.setCommitDescription);
  const setAmending = useRepoStore((s) => s.setAmending);
  const doCommit = useRepoStore((s) => s.doCommit);
  const doAmendCommit = useRepoStore((s) => s.doAmendCommit);

  const stagedFiles = status?.files.filter((f) => f.staged) ?? [];
  const hasStagedChanges = stagedFiles.length > 0;
  const lastCommit = commits[0];

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
    if (disabled) return;
    if (amending) {
      await doAmendCommit(summary.trim(), description.trim());
    } else {
      await doCommit(summary.trim(), description.trim());
    }
  };

  const protectedWarning = branch && isProtectedBranch(branch);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={amending}
              disabled={!lastCommit}
              onCheckedChange={(checked) => toggleAmend(checked === true)}
            />
            Amend last commit
          </label>
        </TooltipTrigger>
        <TooltipContent>
          Amend — replace the last commit with this message and any currently staged changes, instead of
          creating a new commit
        </TooltipContent>
      </Tooltip>
      <Input
        placeholder="Summary (required)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <Textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
      {protectedWarning && (
        <div className="flex items-center gap-1.5 rounded-md bg-accent-yellow/10 px-2 py-1 text-xs text-accent-yellow">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          You're committing directly to {branch}
        </div>
      )}
      <Button
        disabled={disabled}
        title={amending ? "Rewrite the last commit with this message and any staged changes" : "Cmd+Enter"}
        onClick={() => void submit()}
      >
        <GitCommitIcon className="size-3.5" />
        {amending ? "Amend Last Commit" : `Commit to ${branch ?? "…"}`}
      </Button>
    </div>
  );
}
