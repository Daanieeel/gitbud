import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  InfoIcon,
  KeyRoundIcon,
  Loader2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareArrowOutUpRightIcon,
  XIcon,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { homeDir } from "@tauri-apps/api/path";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
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

  const installGpgViaBrew = () =>
    runBusy("installGpg", async () => {
      await api.installGpgViaBrew();
      // A successful brew run doesn't necessarily mean gpg is now on PATH (e.g. it was already
      // installed) — re-check for real instead of trusting the exit code alone.
      setGpgAvailable(await api.hasGpg());
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
        </DialogHeader>

        {/* Circles are laid out with `justify-between` so they sit flush against the dialog's
         * left/right edges instead of centered inside an equal-width column (which left visible
         * dead space at both ends). The track and its colored progress overlay are separate
         * absolute layers inset by the circle radius (3.5 = size-7 / 2) so they start and end
         * exactly at the first/last circle's center. Labels live in their own row below, aligned
         * left/right at the ends so a long one like "Add to provider" can't push anything. */}
        <div className="w-full pt-4 text-xs text-muted-foreground">
          <div className="relative flex items-center justify-between">
            <div className="absolute inset-x-3.5 top-1/2 -z-10 h-px -translate-y-1/2 bg-border" />
            <div
              className="absolute top-1/2 left-3.5 -z-10 h-px -translate-y-1/2 bg-primary transition-all"
              style={{
                width:
                  stepIndex === 0
                    ? "0px"
                    : `calc((100% - 1.75rem) * ${stepIndex / (STEP_ORDER.length - 1)})`,
              }}
            />
            {STEP_ORDER.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  i <= stepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {i < stepIndex ? <CheckIcon className="size-3.5" /> : i + 1}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-4">
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={cn(
                  i === 0
                    ? "text-left"
                    : i === STEP_ORDER.length - 1
                      ? "text-right"
                      : "text-center",
                  i === stepIndex && "font-medium text-foreground",
                )}
              >
                {STEP_LABEL[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-64 flex-col justify-center">
          {step === "intro" && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Key type</span>
                <CardPicker
                  value={format}
                  onChange={setFormat}
                  options={[
                    {
                      value: "ssh",
                      label: "SSH",
                      description: "Recommended. Nothing extra to install",
                    },
                    {
                      value: "openpgp",
                      label: "GPG",
                      description: "Older, widely recognized standard. Needs GnuPG installed",
                      disabled: !gpgAvailable,
                      disabledReason: "gpg not found on PATH",
                    },
                  ]}
                />
                <div className="flex flex-col gap-1.5 rounded-md border border-border p-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {gpgAvailable ? (
                        <CheckIcon className="size-3.5 shrink-0" />
                      ) : (
                        <InfoIcon className="size-3.5 shrink-0" />
                      )}
                      <span>
                        {gpgAvailable ? "GPG installed and available" : "GPG not installed."}
                      </span>
                    </div>
                    {!gpgAvailable && (
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-xs"
                          onClick={() => void openUrl("https://gnupg.org/download/")}
                        >
                          <SquareArrowOutUpRightIcon className="size-3.5" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-6 px-2 text-xs"
                          disabled={busy}
                          onClick={() => void installGpgViaBrew()}
                        >
                          <SparklesIcon
                            className={cn("size-3.5", busyKey === "installGpg" && "animate-spin")}
                          />
                          {busyKey === "installGpg" ? "Installing…" : "Install with brew"}
                        </Button>
                      </div>
                    )}
                  </div>
                  {error && <p className="text-destructive">{error}</p>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Scope</span>
                <CardPicker
                  value={global ? "global" : "repo"}
                  onChange={(v) => setGlobal(v === "global")}
                  options={[
                    {
                      value: "repo",
                      label: "This repo",
                      description: "Just the current repository",
                    },
                    {
                      value: "global",
                      label: "All repos",
                      description: "Every repo on this machine",
                    },
                  ]}
                />
              </div>
            </div>
          )}

          {step === "key" && (
            <div className="flex flex-col gap-2">
              {format === "ssh" ? (
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
              <p className="text-xs text-muted-foreground">
                A generated key has no passphrase. GitBud signs silently on every commit, with
                nothing extra to type each time.
              </p>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {step === "provider" && (
            <div className="flex flex-col gap-2.5">
              {activePubkey && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs">
                    {activePubkey}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => void copyToClipboard(activePubkey)}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <CopyIcon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Copy public key</TooltipContent>
                  </Tooltip>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                {providerLink ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void openUrl(providerLink.url)}
                    className="self-start"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    Open signing key settings
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Paste this key wherever your provider manages signing keys.
                  </p>
                )}
                {providerLink?.note && <InfoTooltip text={providerLink.note} />}
              </div>
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
                label="Test signature verified locally"
                state={checks.testSigned === "pending" ? "checking" : checks.testSigned}
              />
              {checks.providerConfirmed !== "skipped" && (
                <CheckRow
                  label="Found on your GitHub account"
                  state={
                    checks.providerConfirmed === "checking" ? "checking" : checks.providerConfirmed
                  }
                />
              )}
              {done && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-accent-green">
                  <CheckIcon className="size-3.5" />
                  Signing is on. Every commit from here is signed automatically.
                </p>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>

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

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InfoIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Same selectable-card pattern as MergePRDialog's merge-method picker: a short title, a
 * one-line description, a primary-tinted border when selected — and, when disabled, a tooltip
 * explaining why instead of the option just vanishing. */
function CardPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: {
    value: T;
    label: string;
    description: string;
    disabled?: boolean;
    disabledReason?: string;
  }[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const card = (
          <button
            key={o.value}
            type="button"
            // Not a real `disabled` attribute: that would block pointer events in most
            // browsers, silently preventing the tooltip below from ever showing on hover.
            aria-disabled={o.disabled}
            className={cn(
              "flex-1 rounded-md border border-border p-2 text-left",
              o.disabled && "cursor-not-allowed opacity-40",
              value === o.value && "border-2 border-primary bg-primary/10 p-[7px]",
            )}
            onClick={() => !o.disabled && onChange(o.value)}
          >
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.description}</div>
            </div>
          </button>
        );
        if (!o.disabled || !o.disabledReason) return card;
        return (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent>{o.disabledReason}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
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
        {state === "unconfirmed" && " (couldn't confirm, trusting you added it)"}
      </span>
    </div>
  );
}
