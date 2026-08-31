import { useRef, useState } from "react";
import { PaperclipIcon, PencilIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { MarkdownEditor, type MarkdownEditorHandle } from "@gitbud/markdown/editor";
import { Avatar } from "@gitbud/ui/avatar";
import { Markdown } from "@gitbud/ui/markdown";
import { RelativeTime } from "@/components/pr/RelativeTime";
import { useUpdateIssueBody } from "@/hooks/queries/useIssueMeta";
import { api } from "@/lib/tauri";
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
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            <MarkdownEditor
              ref={editorRef}
              autoFocus
              value={body}
              onChange={setBody}
              onUploadImage={uploadImage}
              className="min-h-[160px]"
            />
            {/* `@container`/`@[480px]:` (Tailwind v4's native container queries) rather than a
                viewport breakpoint or a fixed always-stacked layout — this row's *own* available
                width is what matters (e.g. a wide window with the sidebar open still leaves this
                narrow), and 480px is roughly the combined width all three buttons need side by
                side (long "Paste, drop or click to add files" label included) before Save's own
                width gets squeezed down to the point of overflowing/clipping. */}
            <div className="@container">
              <div className="flex flex-col gap-2 @[480px]:flex-row @[480px]:items-center @[480px]:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-muted-foreground @[480px]:w-auto"
                >
                  <PaperclipIcon className="size-3.5" />
                  Paste, drop or click to add files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    for (const file of Array.from(e.target.files ?? [])) {
                      void editorRef.current?.insertImage(file);
                    }
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-col gap-2 @[480px]:flex-row">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full @[480px]:w-auto"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="w-full @[480px]:w-auto"
                    disabled={updateBody.isPending}
                    onClick={() => void save()}
                  >
                    {updateBody.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
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
