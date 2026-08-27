import { useState } from "react";
import { CloudUploadIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { PublishDialog } from "./PublishDialog";

interface PublishButtonProps {
  repoPath: string;
  onPublished: () => void;
}

/** Shown in place of SyncButton when a repo has no `origin` remote yet — the local-repo-only
 * state "Create New Repository" (or an existing local-only repo) leaves it in. */
export function PublishButton({ repoPath, onPublished }: PublishButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CloudUploadIcon className="size-3.5" />
        Publish
      </Button>
      <PublishDialog
        open={open}
        onOpenChange={setOpen}
        repoPath={repoPath}
        onPublished={() => {
          setOpen(false);
          onPublished();
        }}
      />
    </>
  );
}
