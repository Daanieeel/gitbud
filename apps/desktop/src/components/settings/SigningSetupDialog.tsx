import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
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
import { api } from "@/lib/tauri";
import { copyToClipboard } from "@/lib/clipboard";
import { isSinglePath } from "@/lib/dialogPaths";
import { detectRemoteProvider, signingKeySettingsUrl } from "@/lib/remote-provider";
import { useGitHubStore } from "@/store/useGitHubStore";
import { cn } from "@gitbud/ui/utils";

interface SigningSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string | null;
  name: string;
  email: string;
}

type Format = "ssh" | "openpgp";
type Step = "intro" | "key" | "provider" | "verify";

interface VerifyChecks {
  testSigned: "pending" | "ok" | "error";
  providerConfirmed: "skipped" | "checking" | "ok" | "unconfirmed";
}

const STEP_ORDER: Step[] = ["intro", "key", "provider", "verify"];
const STEP_LABEL = {
  intro: "Format",
  key: "Key",
  provider: "Add to provider",
  verify: "Verify",
} satisfies Record<Step, string>;

/** End-to-end commit signing setup: pick a format, get a key (generated or existing), add it
 * to the repo's git provider, then prove the whole chain actually works before calling it done.
 * Closing after the last step leaves the user right back where they started — no separate
 * "now go find the signing settings" trip required. */
export function SigningSetupDialog({
  open: isOpen,
  onOpenChange,
  repoPath,
  name,
  email,
}: SigningSetupDialogProps) {
  const currentLogin = useGitHubStore((s) => s.currentLogin);

  const [step, setStep] = useState<Step>("intro");
  const [format, setFormat] = useState<Format>("ssh");
  const [global, setGlobal] = useState(true);
  const [gpgAvailable, setGpgAvailable] = useState(false);
  const [gpgKeys, setGpgKeys] = useState<[string, string][]>([]);
  const [selectedGpgKey, setSelectedGpgKey] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [gpgPubkey, setGpgPubkey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerHost, setProviderHost] = useState<string | null>(null);
  const [addedConfirmed, setAddedConfirmed] = useState(false);
  const [checks, setChecks] = useState<VerifyChecks>({
    testSigned: "pending",
    providerConfirmed: "skipped",
  });
  const [done, setDone] = useState(false);
  const busy = busyKey !== null;

  useEffect(() => {
    if (!isOpen) return;
    void api.hasGpg().then((available) => {
      setGpgAvailable(available);
      if (available) void api.listGpgKeys().then(setGpgKeys);
    });
    if (repoPath)
      void api.remoteWebInfo(repoPath).then((info) => setProviderHost(info?.[0] ?? null));
  }, [isOpen, repoPath]);

  const reset = () => {
    setStep("intro");
    setPubkey(null);
    setGpgPubkey(null);
    setSelectedGpgKey("");
    setError(null);
    setAddedConfirmed(false);
    setDone(false);
    setChecks({ testSigned: "pending", providerConfirmed: "skipped" });
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const generateSsh = () =>
    runBusy("generateSsh", async () => {
      const defaultDir = await homeDir();
      const path = sshKeyPath.trim() || `${defaultDir}/.ssh/gitbud_signing_ed25519`;
      const pub = await api.generateSshSigningKey(path, email);
      setSshKeyPath(path);
      setPubkey(pub.trim());
    });

  const pickExistingSshKey = async () => {
    const file = await open({ title: "Choose an SSH public key (.pub)" });
    if (!isSinglePath(file)) return;
    setSshKeyPath(file.endsWith(".pub") ? file.slice(0, -4) : file);
    // No pubkey preview for an imported key — reading arbitrary files isn't wired up on the
    // frontend, and the next step degrades fine without one (link + note, no copy box).
    setPubkey(null);
  };

  const generateGpg = () =>
    runBusy("generateGpg", async () => {
      const keyId = await api.generateGpgKey(name, email);
      setSelectedGpgKey(keyId);
      setGpgKeys(await api.listGpgKeys());
    });

  async function runBusy(key: string, fn: () => Promise<void>) {
    setError(null);
    setBusyKey(key);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  const goToProvider = async () => {
    if (format === "openpgp" && selectedGpgKey && !gpgPubkey) {
      try {
        setGpgPubkey((await api.exportGpgPublicKey(selectedGpgKey)).trim());
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    setStep("provider");
  };

  const runVerification = () =>
    runBusy("verify", async () => {
      setStep("verify");
      setChecks({ testSigned: "pending", providerConfirmed: "skipped" });
      const key = format === "ssh" ? sshKeyPath.trim() : selectedGpgKey;
      try {
        await api.testSigning(format, key);
        setChecks((c) => ({ ...c, testSigned: "ok" }));
      } catch (e) {
        setChecks((c) => ({ ...c, testSigned: "error" }));
        setError(String(e));
        return;
      }

      if (currentLogin && providerHost) {
        setChecks((c) => ({ ...c, providerConfirmed: "checking" }));
        try {
          const confirmed =
            format === "ssh"
              ? await api.githubHasSshSigningKey(currentLogin, pubkey ?? "")
              : await api.githubHasGpgKey(currentLogin, selectedGpgKey);
          setChecks((c) => ({ ...c, providerConfirmed: confirmed ? "ok" : "unconfirmed" }));
        } catch {
          setChecks((c) => ({ ...c, providerConfirmed: "unconfirmed" }));
        }
      }

      if (repoPath) {
        await api.configureSigning(repoPath, format, key, global);
        setDone(true);
      }
    });

  if (!repoPath) return null;

  const hasKey = format === "ssh" ? sshKeyPath.trim().length > 0 : selectedGpgKey.length > 0;
  const activePubkey = format === "ssh" ? pubkey : gpgPubkey;
  const provider = providerHost ? detectRemoteProvider(providerHost) : "unknown";
  const providerLink = providerHost ? signingKeySettingsUrl(providerHost, provider, format) : null;
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4" /> Set Up Commit Signing
          </DialogTitle>
          <DialogDescription>
            Signed commits show a "Verified" badge on GitHub/GitLab/etc, proving they really came
            from you. Takes about a minute — a key, a paste into your provider's settings, done.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  i < stepIndex && "border-primary bg-primary text-primary-foreground",
                  i === stepIndex && "border-primary text-primary",
                  i > stepIndex && "border-border",
                )}
              >
                {i < stepIndex ? <CheckIcon className="size-3" /> : i + 1}
              </div>
              <span className={cn(i === stepIndex && "font-medium text-foreground")}>
                {STEP_LABEL[s]}
              </span>
              {i < STEP_ORDER.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        {step === "intro" && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={format === "ssh"} onChange={() => setFormat("ssh")} />
                SSH key (recommended)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={format === "openpgp"}
                  onChange={() => setFormat("openpgp")}
                  disabled={!gpgAvailable}
                />
                GPG {!gpgAvailable && "(gpg not found on PATH)"}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              SSH signing reuses the same key type as SSH auth and needs nothing installed beyond
              what your OS already ships. GPG needs the <code>gpg</code> tool but is the older, more
              widely recognized standard.
            </p>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={global}
                onChange={(e) => setGlobal(e.target.checked)}
              />
              Sign every commit, in every repo (uncheck to set up just this one)
            </label>
          </div>
        )}

        {step === "key" && (
          <div className="flex flex-col gap-2">
            {format === "ssh" ? (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="~/.ssh/gitbud_signing_ed25519"
                    value={sshKeyPath}
                    onChange={(e) => setSshKeyPath(e.target.value)}
                    className="h-8"
                  />
                  <Button size="sm" variant="secondary" onClick={() => void pickExistingSshKey()}>
                    <FolderOpenIcon className="size-3.5" />
                    Existing
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void generateSsh()}
                  >
                    <SparklesIcon
                      className={cn("size-3.5", busyKey === "generateSsh" && "animate-spin")}
                    />
                    {busyKey === "generateSsh" ? "Generating…" : "Generate"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A generated key has no passphrase — GitBud signs silently on every commit, with
                  nothing extra to type each time.
                </p>
              </>
            ) : (
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
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void generateGpg()}
                >
                  <SparklesIcon
                    className={cn("size-3.5", busyKey === "generateGpg" && "animate-spin")}
                  />
                  {busyKey === "generateGpg" ? "Generating…" : "Generate"}
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "provider" && (
          <div className="flex flex-col gap-2.5">
            {activePubkey && (
              <div className="flex items-center gap-2 rounded-sm bg-muted/40 p-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono">{activePubkey}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => void copyToClipboard(activePubkey)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <CopyIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy public key</TooltipContent>
                </Tooltip>
              </div>
            )}
            {providerLink ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openUrl(providerLink.url)}
                  className="self-start"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Open signing key settings
                </Button>
                {providerLink.note && (
                  <p className="text-xs text-muted-foreground">{providerLink.note}</p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Paste this public key wherever your git provider manages signing keys.
              </p>
            )}
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={addedConfirmed}
                onChange={(e) => setAddedConfirmed(e.target.checked)}
              />
              I've added this key to my account
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        {step === "verify" && (
          <div className="flex flex-col gap-1.5 text-sm">
            <CheckRow label="Key ready" state="ok" />
            <CheckRow
              label="Test signature created and verified locally"
              state={checks.testSigned === "pending" ? "checking" : checks.testSigned}
            />
            {checks.providerConfirmed !== "skipped" && (
              <CheckRow
                label={`Key found on your GitHub account`}
                state={
                  checks.providerConfirmed === "checking" ? "checking" : checks.providerConfirmed
                }
              />
            )}
            {done && (
              <p className="mt-1 text-xs text-muted-foreground">
                Signing is on{global ? " for every repo" : " for this repo"}. Close this and keep
                working — every commit from now on is signed automatically.
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step !== "intro" && !done && (
            <Button variant="ghost" onClick={() => setStep(STEP_ORDER[Math.max(0, stepIndex - 1)])}>
              Back
            </Button>
          )}
          {step === "intro" && <Button onClick={() => setStep("key")}>Continue</Button>}
          {step === "key" && (
            <Button disabled={!hasKey} onClick={() => void goToProvider()}>
              Continue
            </Button>
          )}
          {step === "provider" && (
            <Button disabled={!addedConfirmed} onClick={() => void runVerification()}>
              Verify &amp; Enable
            </Button>
          )}
          {step === "verify" && done && <Button onClick={() => close(false)}>Done</Button>}
          {step === "verify" && !done && checks.testSigned === "error" && (
            <Button variant="secondary" onClick={() => void runVerification()}>
              Retry
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckRow({
  label,
  state,
}: {
  label: string;
  state: "ok" | "error" | "checking" | "unconfirmed";
}) {
  return (
    <div className="flex items-center gap-2">
      {state === "ok" && <CheckIcon className="size-3.5 shrink-0 text-accent-green" />}
      {state === "error" && <XIcon className="size-3.5 shrink-0 text-destructive" />}
      {state === "checking" && (
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
      {state === "unconfirmed" && (
        <KeyRoundIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className={state === "unconfirmed" ? "text-muted-foreground" : undefined}>
        {label}
        {state === "unconfirmed" && " — couldn't confirm, trusting you added it"}
      </span>
    </div>
  );
}
