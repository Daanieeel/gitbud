import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CommitBoxProps {
  branch: string | null;
  hasStagedChanges: boolean;
  onCommit: (summary: string, description: string) => Promise<void>;
}

export function CommitBox({ branch, hasStagedChanges, onCommit }: CommitBoxProps) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [committing, setCommitting] = useState(false);

  const disabled = !hasStagedChanges || summary.trim().length === 0 || committing;

  const submit = async () => {
    if (disabled) return;
    setCommitting(true);
    try {
      await onCommit(summary.trim(), description.trim());
      setSummary("");
      setDescription("");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border p-2">
      <Input
        placeholder="Summary (required)"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button disabled={disabled} onClick={() => void submit()}>
        Commit to {branch ?? "…"}
      </Button>
    </div>
  );
}
