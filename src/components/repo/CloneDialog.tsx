import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClone: (url: string, dest: string) => Promise<void>;
}

function repoNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const segment = trimmed.split(/[/:]/).pop();
  return segment || "repository";
}

export function CloneDialog({ open: isOpen, onOpenChange, onClone }: CloneDialogProps) {
  const [url, setUrl] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  const pickParentDir = async () => {
    const dir = await open({ directory: true, title: "Choose a folder to clone into" });
    if (typeof dir === "string") setParentDir(dir);
  };

  const dest = parentDir ? `${parentDir}/${repoNameFromUrl(url)}` : null;
  const disabled = !url.trim() || !dest || cloning;

  const submit = async () => {
    if (!dest) return;
    setCloning(true);
    try {
      await onClone(url.trim(), dest);
      setUrl("");
      setParentDir(null);
      onOpenChange(false);
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone Repository</DialogTitle>
          <DialogDescription>Clone a repository from a URL.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void pickParentDir()}>
              Choose Folder
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {dest ?? "No destination chosen"}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => void submit()}>
            {cloning ? "Cloning…" : "Clone"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
