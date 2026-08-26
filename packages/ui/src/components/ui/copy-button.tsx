import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface CopyButtonProps extends Omit<ComponentProps<"button">, "children"> {
  value: string;
  iconClassName?: string;
  children?: ReactNode;
}

/** Copies `value` to the clipboard and swaps its icon to a green checkmark for two seconds as
 * confirmation, then reverts — the same copy-feedback used for commit hashes, device-flow codes,
 * and signing keys, pulled out so each spot stops re-implementing its own copied-state timer. */
export function CopyButton({
  value,
  className,
  iconClassName = "size-3.5",
  children,
  onClick,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      // A caller wrapping this in a Radix `asChild` trigger (e.g. Tooltip) injects its own
      // `onClick` — compose it in rather than spreading `...props` after ours, which would
      // silently replace the copy logic entirely instead of running both.
      onClick={(e) => {
        onClick?.(e);
        void navigator.clipboard.writeText(value).catch(() => {
          // Clipboard access denied or unavailable — silently no-op rather than throw into a
          // click handler the user can't see the error from.
        });
        setCopied(true);
      }}
      className={className}
      {...props}
    >
      {children}
      {copied ? (
        <CheckIcon className={cn("text-accent-green", iconClassName)} />
      ) : (
        <CopyIcon className={iconClassName} />
      )}
    </button>
  );
}
