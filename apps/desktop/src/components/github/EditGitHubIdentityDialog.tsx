import { useEffect, useState } from "react";
import { GitHubMark } from "@gitbud/ui/brand-logo";
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
import { useGitHubStore } from "@/store/useGitHubStore";
import type { GitHubAccount } from "@/lib/types";

interface EditGitHubIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: GitHubAccount | undefined;
}

export function EditGitHubIdentityDialog({
  open: isOpen,
  onOpenChange,
  account,
}: EditGitHubIdentityDialogProps) {
  const updateAccountIdentity = useGitHubStore((s) => s.updateAccountIdentity);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !account) return;
    setName(account.name ?? "");
    setEmail(account.email || `${account.login}@users.noreply.github.com`);
    setError(null);
  }, [isOpen, account]);

  const canSave = name.trim().length > 0 && email.trim().length > 0;

  const save = async () => {
    if (!account) return;
    setSaving(true);
    setError(null);
    try {
      await updateAccountIdentity(account.login, name.trim(), email.trim());
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitHubMark className="size-5" /> Edit {account?.login}
          </DialogTitle>
          <DialogDescription>
            Overrides the commit name/email used for this account — its GitHub profile isn't
            changed, only what gitbud writes to <code>user.name</code>/<code>user.email</code>{" "}
            when this account is the active identity.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Commit name
            <Input placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Commit email
            <Input
              placeholder="jane@work.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
