import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { MarkdownEditor } from "@gitbud/markdown/editor";
import { Avatar } from "@gitbud/ui/avatar";
import { Markdown } from "@gitbud/ui/markdown";
import { RelativeTime } from "../RelativeTime";
import { useUpdatePullRequestBody } from "@/hooks/queries/usePullRequestMeta";
import { api } from "@/lib/tauri";
import type { PullRequest } from "@/lib/types";

interface PRDescriptionProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRDescription({ repoPath, login, pr }: PRDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(pr.body ?? "");
  const updateBody = useUpdatePullRequestBody(repoPath, login, pr.number);
  const canEdit = pr.author_login === login;

  const save = async () => {
    await updateBody.mutateAsync(body);
    setEditing(false);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.githubUploadAttachment(repoPath, login, file.name, file.type, bytes);
  };

  return (
    <div className="flex gap-2 rounded-md border border-border p-3">
      <Avatar src={pr.author_avatar_url} alt={pr.author_login} className="size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{pr.author_login}</span> opened this PR{" "}
            <RelativeTime iso={pr.created_at} />
          </span>
          {canEdit && !editing && (
            <button
              onClick={() => {
                setBody(pr.body ?? "");
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
            <MarkdownEditor
              autoFocus
              value={body}
              onChange={setBody}
              onUploadImage={uploadImage}
              className="min-h-[160px]"
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
        ) : pr.body ? (
          <Markdown content={pr.body} />
        ) : (
          <p className="text-sm text-muted-foreground">No description provided.</p>
        )}
      </div>
    </div>
  );
}
