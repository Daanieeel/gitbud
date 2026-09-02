import { useEffect, useState } from "react";
import { FolderOpenIcon, KeyRoundIcon, SparklesIcon } from "lucide-react";
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
import { CardPicker } from "@gitbud/ui/card-picker";
import { CopyButton } from "@gitbud/ui/copy-button";
import { useIdentityStore } from "@/store/useIdentityStore";
import { api } from "@/lib/tauri";
import { cn } from "@gitbud/ui/utils";
import { isSinglePath } from "@/lib/dialogPaths";
import type { SshIdentity } from "@/lib/types";

interface AddSshIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, edits this identity instead of creating a new one. */
  identity?: SshIdentity;
}

export function AddSshIdentityDialog({
  open: isOpen,
  onOpenChange,
  identity,
}: AddSshIdentityDialogProps) {
  const addSshIdentity = useIdentityStore((s) => s.addSshIdentity);
  const updateSshIdentity = useIdentityStore((s) => s.updateSshIdentity);
  const isEditing = identity !== undefined;
  const [mode, setMode] = useState<"quick" | "advanced">("advanced");
  const [label, setLabel] = useState("");
  const [host, setHost] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMode(isEditing ? "advanced" : "quick");
    setLabel(identity?.label ?? "");
    setHost(identity?.host ?? "");
    setKeyPath(identity?.key_path ?? "");
    setName(identity?.name ?? "");
    setEmail(identity?.email ?? "");
    setPubkey(null);
    setError(null);
  };

  // Re-seed the form whenever the dialog opens (fresh blank form for "add", or this identity's
  // current values for "edit") — not on every `identity` change, so editing doesn't reset the
  // form mid-edit if the underlying store happens to re-render.
  useEffect(() => {
    if (isOpen) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  const canSave =
    host.trim().length > 0 &&
    keyPath.trim().length > 0 &&
    name.trim().length > 0 &&
    email.trim().length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEditing) {
        await updateSshIdentity(
          identity.id,
          label.trim() || host.trim(),
          host.trim(),
          keyPath.trim(),
          name.trim(),
          email.trim(),
        );
      } else {
        await addSshIdentity(
          label.trim() || host.trim(),
          host.trim(),
          keyPath.trim(),
          name.trim(),
          email.trim(),
        );
      }
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
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
            <KeyRoundIcon className="size-5" /> {isEditing ? "Edit SSH Identity" : "Add SSH Identity"}
          </DialogTitle>
          <DialogDescription>
            A plain git identity authenticated by an SSH key. No hosted-provider account or API
            access — just this host, key, and commit name/email used when this identity is
            active.
          </DialogDescription>
        </DialogHeader>
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
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              Commit name
              <Input
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Commit email
              <Input
                placeholder="jane@work.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
          <p className="-mt-1.5 text-xs text-muted-foreground">
            Applied to <code>user.name</code>/<code>user.email</code> whenever this identity is
            active, so commits are correctly attributed.
          </p>
          <CardPicker
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "quick",
                label: "Generate new key",
                description: "Creates a new ed25519 key just for this host",
              },
              {
                value: "advanced",
                label: "Use existing key",
                description: "Point at a private key you already have",
              },
            ]}
          />
          {mode === "quick" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  readOnly
                  placeholder="Generate new key…"
                  value={keyPath}
                  className="h-8 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!host.trim() || generating}
                  onClick={() => void generateKey()}
                >
                  <SparklesIcon className={cn("size-3.5", generating && "animate-spin")} />
                  {generating ? "Generating…" : "Generate"}
                </Button>
              </div>
              {pubkey && (
                <>
                  <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm">
                      {pubkey}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CopyButton
                          value={pubkey}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                        />
                      </TooltipTrigger>
                      <TooltipContent>Copy public key</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy this public key into {host.trim() || "the host"}'s SSH keys settings.
                  </p>
                </>
              )}
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              SSH private key
              <div className="flex gap-2">
                <Input
                  readOnly
                  placeholder="No file chosen"
                  value={keyPath}
                  className="h-8 font-mono text-xs"
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => void pickKey()}>
                  <FolderOpenIcon className="size-3.5" />
                  Browse
                </Button>
              </div>
            </label>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Identity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
