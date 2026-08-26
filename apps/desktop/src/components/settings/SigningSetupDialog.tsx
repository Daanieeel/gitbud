import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  CheckIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GlobeIcon,
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
import { CardPicker } from "@gitbud/ui/card-picker";
import { Checkbox } from "@gitbud/ui/checkbox";
import { CopyButton } from "@gitbud/ui/copy-button";
import { GitHubMark, GitLabMark, BitbucketMark } from "@gitbud/ui/brand-logo";
import { api } from "@/lib/tauri";
import { isSinglePath } from "@/lib/dialogPaths";
import { firstMatch } from "@/lib/utils";
import {
  detectRemoteProvider,
  signingKeySettingsUrl,
  type RemoteProvider,
} from "@/lib/remote-provider";
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

const PROVIDER_LABEL = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  unknown: "Custom",
} satisfies Record<RemoteProvider, string>;

const PROVIDER_DEFAULT_HOST = {
  github: "github.com",
  gitlab: "gitlab.com",
  bitbucket: "bitbucket.org",
  unknown: null,
} satisfies Record<RemoteProvider, string | null>;

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
  const [keyMode, setKeyMode] = useState<"generate" | "existing">("generate");
  const [defaultDir, setDefaultDir] = useState("");
  const [gpgAvailable, setGpgAvailable] = useState(false);
  const [gpgKeys, setGpgKeys] = useState<[string, string][]>([]);
  const [selectedGpgKey, setSelectedGpgKey] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [gpgPubkey, setGpgPubkey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerHost, setProviderHost] = useState<string | null>(null);
  const [providerChoice, setProviderChoice] = useState<RemoteProvider>("unknown");
  const [addedConfirmed, setAddedConfirmed] = useState(false);
  const [checks, setChecks] = useState<VerifyChecks>({
    testSigned: "pending",
    providerConfirmed: "skipped",
  });
  const [done, setDone] = useState(false);
  const busy = busyKey !== null;

  useEffect(() => {
    if (!isOpen) return;
    void homeDir().then(setDefaultDir);
    void api.hasGpg().then((available) => {
      setGpgAvailable(available);
      if (available) void api.listGpgKeys().then(setGpgKeys);
    });
    if (repoPath)
      void api.remoteWebInfo(repoPath).then((info) => {
        const host = info?.[0] ?? null;
        setProviderHost(host);
        setProviderChoice(host ? detectRemoteProvider(host) : "unknown");
      });
  }, [isOpen, repoPath]);

  const reset = () => {
    setStep("intro");
    setKeyMode("generate");
    setSshKeyPath("");
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
      const path = sshKeyPath.trim() || `${defaultDir}/.ssh/gitbud_signing_ed25519`;
      const pub = await api.generateSshSigningKey(path, email);
      setSshKeyPath(path);
      setPubkey(pub.trim());
    });

  const pickExistingSshKey = async () => {
    const file = await open({
      title: "Choose an SSH public key (.pub)",
      defaultPath: defaultDir ? `${defaultDir}/.ssh` : undefined,
      filters: [{ name: "SSH public key", extensions: ["pub"] }],
    });
    if (!isSinglePath(file)) return;
    setSshKeyPath(file.endsWith(".pub") ? file.slice(0, -4) : file);
    await runBusy("readExistingSsh", async () => {
      setPubkey((await api.readSshPublicKey(file)).trim());
    });
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
  const detectedProvider = providerHost ? detectRemoteProvider(providerHost) : "unknown";
  // The real detected host is only valid for the detected provider — if the user picks a
  // different one (their repo's remote doesn't match where they actually keep their account),
  // fall back to that provider's default public domain instead of mismatching host and shape.
  const providerChoiceHost =
    providerChoice === detectedProvider ? providerHost : PROVIDER_DEFAULT_HOST[providerChoice];
  const providerLink = providerChoiceHost
    ? signingKeySettingsUrl(providerChoiceHost, providerChoice, format)
    : null;
  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5" /> Set Up Commit Signing
          </DialogTitle>
        </DialogHeader>

        {/* Circles are laid out with `justify-between` so they sit flush against the dialog's
         * left/right edges instead of centered inside an equal-width column (which left visible
         * dead space at both ends). The track and its colored progress overlay are separate
         * absolute layers inset by the circle radius (3.5 = size-7 / 2) so they start and end
         * exactly at the first/last circle's center. Labels live in their own row below, aligned
         * left/right at the ends so a long one like "Add to provider" can't push anything. */}
        <div className="mb-4 w-full px-1 pt-4 text-xs text-muted-foreground">
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
          {/* Positioned to land under each circle's exact center — the same "inset by radius,
           * then a fraction of what's left" math the track/progress-fill above use — rather than
           * centered in an equal-width grid column, which drifted off-center for the two middle
           * steps as soon as a neighboring label (like "Add to provider") was a different width. */}
          <div className="relative mt-2 h-4">
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  i === stepIndex && "font-medium text-foreground",
                )}
                style={
                  firstMatch<CSSProperties>([
                    [i === 0, { left: 0 }],
                    [i === STEP_ORDER.length - 1, { right: 0 }],
                    [
                      true,
                      {
                        left: `calc(0.875rem + ${i / (STEP_ORDER.length - 1)} * (100% - 1.75rem))`,
                        transform: "translateX(-50%)",
                      },
                    ],
                  ]) ?? undefined
                }
              >
                {STEP_LABEL[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex min-h-64 flex-col justify-start">
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
              <div className="mb-2">
                <CardPicker
                  value={keyMode}
                  onChange={setKeyMode}
                  options={[
                    {
                      value: "generate",
                      label: "Generate new key",
                      description:
                        format === "ssh"
                          ? "Creates a new ed25519 key just for signing"
                          : "Creates a new GPG key just for signing",
                    },
                    {
                      value: "existing",
                      label: "Choose existing key",
                      description:
                        format === "ssh"
                          ? "Use an SSH key you already have"
                          : "Pick a key already in your keyring",
                    },
                  ]}
                />
              </div>
              {format === "ssh" ? (
                keyMode === "generate" ? (
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      placeholder="Generate new key…"
                      value={sshKeyPath}
                      className="h-8 font-mono text-xs"
                    />
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
                    <Input
                      readOnly
                      placeholder="No file chosen"
                      value={sshKeyPath}
                      className="h-8 font-mono text-xs"
                    />
                    <Button size="sm" variant="secondary" onClick={() => void pickExistingSshKey()}>
                      <FolderOpenIcon className="size-3.5" />
                      Choose file
                    </Button>
                  </div>
                )
              ) : keyMode === "generate" ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    placeholder="Generate new key…"
                    value={
                      selectedGpgKey
                        ? `${gpgKeys.find(([id]) => id === selectedGpgKey)?.[1] ?? ""} (${selectedGpgKey.slice(-8)})`
                        : ""
                    }
                    className="h-8 font-mono text-xs"
                  />
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
              ) : (
                <select
                  value={selectedGpgKey}
                  onChange={(e) => setSelectedGpgKey(e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">Choose a key…</option>
                  {gpgKeys.map(([id, uid]) => (
                    <option key={id} value={id}>
                      {uid} ({id.slice(-8)})
                    </option>
                  ))}
                </select>
              )}
              {keyMode === "generate" && (
                <p className="text-xs text-muted-foreground">
                  A generated key has no passphrase. GitBud signs silently on every commit, with
                  nothing extra to type each time.
                </p>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}

          {step === "provider" && (
            <div className="flex flex-col gap-2.5">
              {activePubkey && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                  <span className="max-h-20 min-w-0 flex-1 overflow-y-auto leading-5 font-mono text-sm break-all whitespace-pre-wrap">
                    {activePubkey}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CopyButton
                        value={activePubkey}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Copy public key</TooltipContent>
                  </Tooltip>
                </div>
              )}
              <ProviderPicker value={providerChoice} onChange={setProviderChoice} />
              {providerLink ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void openUrl(providerLink.url)}
                  className="w-full"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  Open signing key settings
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Paste this key wherever your provider manages signing keys.
                </p>
              )}
              {providerLink?.note && (
                <p className="text-xs text-muted-foreground">{providerLink.note}</p>
              )}
              <label
                className={cn(
                  "mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-border p-2",
                  addedConfirmed && "border-2 border-primary bg-primary/10 p-[7px]",
                )}
              >
                <Checkbox
                  checked={addedConfirmed}
                  onCheckedChange={(checked) => setAddedConfirmed(checked === true)}
                />
                <span className="text-sm font-medium">I've added this key to my account</span>
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

/** Same card style as CardPicker below (border, primary highlight when selected) but compact and
 * icon-led instead of description-led — four providers fit comfortably in one row. */
function ProviderPicker({
  value,
  onChange,
}: {
  value: RemoteProvider;
  onChange: (v: RemoteProvider) => void;
}) {
  const options: { value: RemoteProvider; icon: ReactNode }[] = [
    { value: "github", icon: <GitHubMark className="size-4" /> },
    { value: "gitlab", icon: <GitLabMark className="size-4" /> },
    { value: "bitbucket", icon: <BitbucketMark className="size-4" /> },
    { value: "unknown", icon: <GlobeIcon className="size-4" /> },
  ];
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1.5 rounded-md border border-border p-2",
            value === o.value && "border-2 border-primary bg-primary/10 p-[7px]",
          )}
        >
          {o.icon}
          <span className="text-xs font-medium">{PROVIDER_LABEL[o.value]}</span>
        </button>
      ))}
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
