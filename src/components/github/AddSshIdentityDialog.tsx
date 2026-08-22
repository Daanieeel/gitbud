import { useState } from "react";
import { FolderOpenIcon, KeyRoundIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
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
import { useIdentityStore } from "@/store/useIdentityStore";

interface AddSshIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSshIdentityDialog({ open: isOpen, onOpenChange }: AddSshIdentityDialogProps) {
  const addSshIdentity = useIdentityStore((s) => s.addSshIdentity);
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setLabel("");
    setHost("");
    setKeyPath("");
  };

  const pickKey = async () => {
    const defaultDir = await homeDir().then((h) => `${h}/.ssh`).catch(() => undefined);
    const file = await open({ title: "Choose an SSH private key", defaultPath: defaultDir, multiple: false });
    if (typeof file === "string") setKeyPath(file);
  };

  const canSave = host.trim().length > 0 && keyPath.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await addSshIdentity(label.trim() || host.trim(), host.trim(), keyPath.trim());
      reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" /> Add SSH Identity
          </DialogTitle>
          <DialogDescription>
            A plain git identity authenticated by an SSH key — no hosted-provider account or API
            access, just this host and key used when pushing/pulling.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Label (optional)
            <Input placeholder="Work GitLab" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Host
            <Input placeholder="gitlab.company.com" value={host} onChange={(e) => setHost(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            SSH private key
            <div className="flex gap-2">
              <Input
                placeholder="~/.ssh/id_ed25519"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void pickKey()}>
                <FolderOpenIcon className="size-3.5" />
                Browse
              </Button>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Adding…" : "Add Identity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
