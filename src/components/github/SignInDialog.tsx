import { useState } from "react";
import { ExternalLinkIcon, LogInIcon, PencilIcon, PlayIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
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
import { useGitHubStore } from "@/store/useGitHubStore";

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignInDialog({ open, onOpenChange }: SignInDialogProps) {
  const clientId = useGitHubStore((s) => s.clientId);
  const deviceFlow = useGitHubStore((s) => s.deviceFlow);
  const setClientId = useGitHubStore((s) => s.setClientId);
  const startSignIn = useGitHubStore((s) => s.startSignIn);
  const cancelSignIn = useGitHubStore((s) => s.cancelSignIn);
  const tryGhCli = useGitHubStore((s) => s.tryGhCli);

  const [clientIdInput, setClientIdInput] = useState(clientId ?? "");
  const [ghCliChecked, setGhCliChecked] = useState(false);
  const [ghCliTrying, setGhCliTrying] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      cancelSignIn();
      setGhCliChecked(false);
      setShowManual(false);
    }
    onOpenChange(next);
  };

  const attemptGhCli = async () => {
    setGhCliTrying(true);
    try {
      const found = await tryGhCli();
      if (found) {
        onOpenChange(false);
      } else {
        setGhCliChecked(true);
      }
    } finally {
      setGhCliTrying(false);
    }
  };

  if (!ghCliChecked && !showManual && !clientId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect GitHub</DialogTitle>
            <DialogDescription>
              If you already use the GitHub CLI (`gh`) and are logged in there, GitBud can reuse
              that login with one click — no setup needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button variant="ghost" onClick={() => setShowManual(true)}>
              I don't use gh CLI
            </Button>
            <Button disabled={ghCliTrying} onClick={() => void attemptGhCli()}>
              <LogInIcon className="size-3.5" />
              {ghCliTrying ? "Checking…" : "Use gh CLI login"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!clientId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect GitHub</DialogTitle>
            <DialogDescription>
              {ghCliChecked && "No gh CLI login found. "}
              GitBud has no bundled credentials — register your own OAuth App (free, one-time)
              with Device Flow enabled, then paste its Client ID here.
            </DialogDescription>
          </DialogHeader>
          <a
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            href="https://github.com/settings/applications/new"
            target="_blank"
            rel="noreferrer"
          >
            Register a GitHub OAuth App <ExternalLinkIcon className="size-3.5" />
          </a>
          <Input
            placeholder="Client ID"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
          />
          <DialogFooter>
            <Button
              disabled={!clientIdInput.trim()}
              onClick={() => void setClientId(clientIdInput.trim())}
            >
              <SaveIcon className="size-3.5" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!deviceFlow) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in with GitHub</DialogTitle>
            <DialogDescription>
              You'll get a one-time code to enter at github.com — no password is ever seen by
              GitBud.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClientId("")}>
              <PencilIcon className="size-3.5" />
              Change Client ID
            </Button>
            <Button onClick={() => void startSignIn()}>
              <PlayIcon className="size-3.5" />
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in with GitHub</DialogTitle>
        </DialogHeader>
        {deviceFlow.status === "waiting" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-3xl font-mono font-bold tracking-widest">
              {deviceFlow.code.user_code}
            </span>
            <a
              className="flex items-center gap-1 text-sm text-primary hover:underline"
              href={deviceFlow.code.verification_uri}
              target="_blank"
              rel="noreferrer"
            >
              Open {deviceFlow.code.verification_uri} <ExternalLinkIcon className="size-3.5" />
            </a>
            <span className="text-xs text-muted-foreground">Waiting for confirmation…</span>
          </div>
        )}
        {deviceFlow.status === "denied" && (
          <p className="text-sm text-destructive">Sign-in was denied.</p>
        )}
        {deviceFlow.status === "expired" && (
          <p className="text-sm text-destructive">Code expired — try again.</p>
        )}
        {deviceFlow.status === "error" && (
          <p className="text-sm text-destructive">{deviceFlow.error}</p>
        )}
        {deviceFlow.status !== "waiting" && (
          <DialogFooter>
            <Button onClick={() => void startSignIn()}>
              <RotateCcwIcon className="size-3.5" />
              Retry
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
