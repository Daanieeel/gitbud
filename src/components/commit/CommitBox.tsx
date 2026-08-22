import { useEffect, useState } from "react";
import { GitCommitIcon, HistoryIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepoStore } from "@/store/useRepoStore";
import { isProtectedBranch } from "@/lib/utils";
import { getRecentCommitMessages } from "@/lib/commit-history";

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
  const [recentOpen, setRecentOpen] = useState(false);
  const recentMessages = recentOpen ? getRecentCommitMessages() : [];

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
      {protectedWarning && (
        <div className="flex items-center gap-1.5 rounded-md bg-accent-yellow/10 px-2 py-1 text-xs text-accent-yellow">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          You're committing directly to {branch}
        </div>
      )}
      <label
        className="flex items-center gap-2 text-xs text-muted-foreground"
        title="Amend — replace the last commit with this message and any currently staged changes, instead of creating a new commit"
      >
        <Checkbox
          checked={amending}
          disabled={!lastCommit}
          onCheckedChange={(checked) => toggleAmend(checked === true)}
        />
        Amend last commit
      </label>
      <div className="flex items-center gap-1">
        <Input
          placeholder="Summary (required)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
        <Popover open={recentOpen} onOpenChange={setRecentOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Recently used commit messages"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <HistoryIcon className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-1" align="end">
            {recentMessages.length === 0 ? (
              <div className="p-3 text-center text-sm text-muted-foreground">
                No recent messages yet
              </div>
            ) : (
              recentMessages.map((msg, i) => (
                <div
                  key={i}
                  className="cursor-pointer truncate rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    setSummary(msg);
                    setRecentOpen(false);
                  }}
                >
                  {msg}
                </div>
              ))
            )}
          </PopoverContent>
        </Popover>
      </div>
      <Textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
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
