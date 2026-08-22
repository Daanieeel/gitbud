import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";

interface CreateBranchAtDialogProps {
  oid: string | null;
  onOpenChange: (open: boolean) => void;
}

export function CreateBranchAtDialog({ oid, onOpenChange }: CreateBranchAtDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const refreshBranches = useRepoStore((s) => s.refreshBranches);
  const [name, setName] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (!repoPath || !oid || !name.trim()) return;
    setCreating(true);
    try {
      await api.createBranchAt(repoPath, name.trim(), oid, checkout);
      await refreshBranches();
      setName("");
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={oid != null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Branch Here</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Branch name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={checkout} onChange={(e) => setCheckout(e.target.checked)} />
          Switch to new branch
        </label>
        <DialogFooter>
          <Button disabled={!name.trim() || creating} onClick={() => void submit()}>
            Create Branch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
