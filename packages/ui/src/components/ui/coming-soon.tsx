import type { LucideIcon } from "lucide-react";

import { cn } from "../../lib/utils";

function ComingSoon({
  title,
  icon: Icon,
  className,
}: {
  title: string;
  icon: LucideIcon;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-dot-grid relative flex h-svh flex-col items-center justify-center overflow-hidden px-6 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="bg-accent-pink/25 absolute top-1/4 -left-24 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-blue/25 absolute -right-24 bottom-1/4 size-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-purple/20 absolute top-1/2 left-1/2 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-green/20 absolute right-1/4 bottom-0 size-56 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-blue/20 absolute top-8 right-1/3 size-40 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-pink/15 absolute bottom-8 left-1/4 size-48 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-purple/25 absolute top-2/3 -right-10 size-40 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-accent-green/15 absolute top-8 -left-10 size-36 rounded-full blur-3xl"
      />

      <div className="bg-background border-border relative flex size-16 items-center justify-center rounded-2xl border shadow-sm">
        <Icon className="text-accent-purple size-7" strokeWidth={1.75} aria-hidden />
      </div>

      <h1 className="relative mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="text-muted-foreground relative mt-3 text-base">This page is coming soon.</p>
    </section>
  );
}

export { ComingSoon };
