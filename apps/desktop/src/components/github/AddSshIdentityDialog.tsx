import { useState } from "react";
import { CopyIcon, FolderOpenIcon, KeyRoundIcon, SparklesIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useIdentityStore } from "@/store/useIdentityStore";
import { api } from "@/lib/tauri";
import { cn } from "@gitbud/ui/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { isSinglePath } from "@/lib/dialogPaths";

interface AddSshIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSshIdentityDialog({ open: isOpen, onOpenChange }: AddSshIdentityDialogProps) {
  const addSshIdentity = useIdentityStore((s) => s.addSshIdentity);
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode("quick");
    setLabel("");
    setHost("");
    setKeyPath("");
    setPubkey(null);
    setError(null);
  };

  const pickKey = async () => {
    const defaultDir = await homeDir()
      .then((h) => `${h}/.ssh`)
      .catch(() => undefined);
    const file = await open({
      title: "Choose an SSH private key",
      defaultPath: defaultDir,
      multiple: false,
    });
    if (isSinglePath(file)) setKeyPath(file);
  };

  const generateKey = async () => {
    if (!host.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const dir = await homeDir();
      const slug = host
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      const path = `${dir}/.ssh/gitbud_${slug}_ed25519`;
      const pub = await api.generateSshSigningKey(path, label.trim() || host.trim());
      setKeyPath(path);
      setPubkey(pub.trim());
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
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
            A plain git identity authenticated by an SSH key. No hosted-provider account or API
            access, just this host and key used when pushing/pulling.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 rounded-md bg-muted/40 p-1 text-sm">
          <button
            type="button"
            className={cn(
              "flex-1 rounded-sm py-1 text-center",
              mode === "quick" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setMode("quick")}
          >
            Quick
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 rounded-sm py-1 text-center",
              mode === "advanced" ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setMode("advanced")}
          >
            Advanced
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Label (optional)
            <Input
              placeholder="Work GitLab"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Host
            <Input
              placeholder="gitlab.company.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </label>
          {mode === "quick" ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!host.trim() || generating}
                onClick={() => void generateKey()}
              >
                <SparklesIcon className="size-3.5" />
                {generating ? "Generating…" : pubkey ? "Regenerate key" : "Generate a new key"}
              </Button>
              {pubkey && (
                <>
                  <div className="flex items-center gap-2 rounded-sm bg-muted/40 p-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate font-mono">{pubkey}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(pubkey)}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <CopyIcon className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Copy public key</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy this public key into {host.trim() || "the host"}'s SSH keys settings.
                  </p>
                </>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              SSH private key
              <div className="flex gap-2">
                <Input
                  placeholder="~/.ssh/id_ed25519"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => void pickKey()}>
                  <FolderOpenIcon className="size-3.5" />
                  Browse
                </Button>
              </div>
            </label>
          )}
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
