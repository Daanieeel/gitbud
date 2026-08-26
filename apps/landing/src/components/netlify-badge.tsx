import Link from "next/link";
import { NetlifyMark } from "@gitbud/ui/brand-logo";
import { getMessages } from "@/i18n/get-messages";

export function NetlifyBadge() {
  const { netlifyBadge } = getMessages();

  return (
    <Link
      href="https://www.netlify.com"
      target="_blank"
      rel="noopener noreferrer"
      className="border-border bg-card text-muted-foreground hover:text-foreground fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-colors"
    >
      {netlifyBadge.label}
      <NetlifyMark className="size-5" />
      <span className="text-foreground">Netlify</span>
    </Link>
  );
}
