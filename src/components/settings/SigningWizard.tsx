import { useEffect, useState } from "react";
import { CopyIcon, KeyRoundIcon, PlusIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/tauri";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { SigningStatus } from "@/lib/types";

interface SigningWizardProps {
  repoPath: string | null;
  name: string;
  email: string;
  global: boolean;
}

type Format = "ssh" | "openpgp";

export function SigningWizard({ repoPath, name, email, global }: SigningWizardProps) {
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [format, setFormat] = useState<Format>("ssh");
  const [gpgAvailable, setGpgAvailable] = useState(false);
  const [gpgKeys, setGpgKeys] = useState<[string, string][]>([]);
  const [selectedGpgKey, setSelectedGpgKey] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const [error, setError] = useState<string | null>(null);

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    const startedAt = Date.now();
    setBusyKey(key);
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!repoPath) return;
    void api.getSigningStatus(repoPath).then(setStatus);
    void api.hasGpg().then((available) => {
      setGpgAvailable(available);
      if (available) void api.listGpgKeys().then(setGpgKeys);
    });
  }, [repoPath]);

  if (!repoPath) return null;

  const generateSsh = () =>
    runBusy("generateSsh", async () => {
      setError(null);
      try {
        const defaultDir = await homeDir();
        const path = sshKeyPath.trim() || `${defaultDir}/.ssh/gitbud_signing_ed25519`;
        const pub = await api.generateSshSigningKey(path, email);
        setSshKeyPath(path);
        setPubkey(pub.trim());
      } catch (e) {
        setError(String(e));
      }
    });

  const pickExistingSshKey = async () => {
    const file = await open({ title: "Choose an SSH public key (.pub)" });
    if (typeof file === "string") setSshKeyPath(file);
  };

  const generateGpg = () =>
    runBusy("generateGpg", async () => {
      setError(null);
      try {
        const keyId = await api.generateGpgKey(name, email);
        setSelectedGpgKey(keyId);
        const keys = await api.listGpgKeys();
        setGpgKeys(keys);
      } catch (e) {
        setError(String(e));
      }
    });

  const enable = () =>
    runBusy("enable", async () => {
      setError(null);
      try {
        const signingKey = format === "ssh" ? sshKeyPath.trim() : selectedGpgKey;
        if (!signingKey) {
          setError(format === "ssh" ? "Generate or choose a key first" : "Choose a GPG key first");
          return;
        }
        await api.configureSigning(repoPath, format, signingKey, global);
        setStatus(await api.getSigningStatus(repoPath));
      } catch (e) {
        setError(String(e));
      }
    });

  const disable = () =>
    runBusy("disable", async () => {
      setError(null);
      try {
        await api.disableSigning(repoPath, global);
        setStatus(await api.getSigningStatus(repoPath));
      } catch (e) {
        setError(String(e));
      }
    });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {status?.enabled ? (
          <ShieldCheckIcon className="size-4 text-accent-green" />
        ) : (
          <ShieldOffIcon className="size-4 text-muted-foreground" />
        )}
        Commit Signing
        {status?.enabled && (
          <span className="text-xs font-normal text-muted-foreground">
            ({status.format}, {status.signing_key?.slice(0, 24)}
            {(status.signing_key?.length ?? 0) > 24 ? "…" : ""})
          </span>
        )}
      </div>

      {!status?.enabled && (
        <>
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="radio" checked={format === "ssh"} onChange={() => setFormat("ssh")} />
              SSH key (recommended)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={format === "openpgp"}
                onChange={() => setFormat("openpgp")}
                disabled={!gpgAvailable}
              />
              GPG {!gpgAvailable && "(gpg not found on PATH)"}
            </label>
          </div>

          {format === "ssh" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder="~/.ssh/gitbud_signing_ed25519"
                  value={sshKeyPath}
                  onChange={(e) => setSshKeyPath(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" variant="secondary" onClick={() => void pickExistingSshKey()}>
                  <KeyRoundIcon className="size-3.5" />
                  Use Existing
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void generateSsh()}>
                  <PlusIcon className={cn("size-3.5", busyKey === "generateSsh" && "animate-spin")} />
                  {busyKey === "generateSsh" ? "Generating…" : "Generate New"}
                </Button>
              </div>
              {pubkey && (
                <div className="flex items-center gap-2 rounded-sm bg-muted/40 p-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono">{pubkey}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => void copyToClipboard(pubkey)}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <CopyIcon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy public key</TooltipContent>
                  </Tooltip>
                </div>
              )}
              {pubkey && (
                <p className="text-xs text-muted-foreground">
                  Add this as a "Signing Key" on GitHub/GitLab so signed commits show as Verified.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <select
                  value={selectedGpgKey}
                  onChange={(e) => setSelectedGpgKey(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Choose a key…</option>
                  {gpgKeys.map(([id, uid]) => (
                    <option key={id} value={id}>
                      {uid} ({id.slice(-8)})
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void generateGpg()}>
                  <PlusIcon className={cn("size-3.5", busyKey === "generateGpg" && "animate-spin")} />
                  {busyKey === "generateGpg" ? "Generating…" : "Generate New"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" disabled={busy} onClick={() => void enable()}>
              {busyKey === "enable" ? "Enabling…" : "Enable Signing"}
            </Button>
          </div>
        </>
      )}
      {status?.enabled && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void disable()}>
            {busyKey === "disable" ? "Disabling…" : "Disable Signing"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
