import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Textarea } from "@gitbud/ui/textarea";
import { Avatar } from "@gitbud/ui/avatar";
import { Markdown } from "@gitbud/ui/markdown";
import { RelativeTime } from "@/components/pr/RelativeTime";
import { useUpdateIssueBody } from "@/hooks/queries/useIssueMeta";
import type { Issue } from "@/lib/types";

interface IssueDescriptionProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

export function IssueDescription({ repoPath, login, issue }: IssueDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(issue.body ?? "");
  const updateBody = useUpdateIssueBody(repoPath, login, issue.number);
  const canEdit = issue.author_login === login;

  const save = async () => {
    await updateBody.mutateAsync(body);
    setEditing(false);
  };

  return (
    <div className="flex gap-2 rounded-md border border-border p-3">
      <Avatar src={issue.author_avatar_url} alt={issue.author_login} className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{issue.author_login}</span> opened this
            issue <RelativeTime iso={issue.created_at} />
          </span>
          {canEdit && !editing && (
            <button
              onClick={() => {
                setBody(issue.body ?? "");
                setEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <PencilIcon className="size-3.5" />
            </button>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Textarea
              autoFocus
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={updateBody.isPending} onClick={() => void save()}>
                {updateBody.isPending ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : issue.body ? (
          <Markdown content={issue.body} />
        ) : (
          <p className="text-sm text-muted-foreground">No description provided.</p>
        )}
      </div>
    </div>
  );
}
