"use client";

import { MessageCircleIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { Button } from "@gitbud/ui/button";
import { CopyButton } from "@gitbud/ui/copy-button";

const FIX_COMMAND = "xattr -cr /Applications/GitBud.app";
const DISCORD_DM_URL = "https://discord.com/users/427107119406514176";

export function MacSigningFixDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TriangleAlertIcon className="size-6 shrink-0 text-destructive" />
            macOS says the app is damaged
          </DialogTitle>
          <DialogDescription className="text-base">
            GitBud isn&apos;t notarized by Apple yet, so Gatekeeper blocks it as if it were
            corrupted. It isn&apos;t. Run this command in Terminal after moving GitBud to
            Applications to clear the quarantine flag:
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3">
            <span className="min-w-0 flex-1 overflow-x-auto font-mono text-base whitespace-pre">
              {FIX_COMMAND}
            </span>
            <CopyButton
              value={FIX_COMMAND}
              iconClassName="size-4"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              title="Copy command"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            This is a temporary workaround. A signed, notarized build needs a paid Apple Developer
            account, which we don&apos;t have yet. We&apos;re looking for sponsors to cover it.
          </p>
          <Button size="sm" variant="secondary" className="w-full" asChild>
            <Link href={DISCORD_DM_URL} target="_blank" rel="noopener noreferrer">
              <MessageCircleIcon className="size-3.5" />
              Message me on Discord
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
