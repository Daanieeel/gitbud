import Link from "next/link";
import { Button } from "@gitbud/ui/button";
import { getMessages } from "@/i18n/get-messages";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-0.5 size-5">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86Z" />
    </svg>
  );
}

export function Hero() {
  const { hero } = getMessages();

  return (
    <section className="mx-auto max-w-6xl px-6 pt-32 pb-16 sm:pt-36">
      <div className="grid gap-8 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <p className="text-muted-foreground text-xs uppercase">{hero.eyebrow}</p>
          <h1 className="mt-4 text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            {hero.headline.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
        </div>
        <div className="flex flex-col gap-6 sm:pt-2">
          <p className="text-muted-foreground max-w-sm text-base">{hero.description}</p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="https://github.com/Daanieeel/gitbud/releases">{hero.primaryCta}</Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link
                href="https://github.com/Daanieeel/gitbud"
                target="_blank"
                rel="noopener noreferrer"
              >
                {hero.secondaryCta}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="from-accent-blue/20 via-accent-purple/15 to-accent-pink/20 border-border mt-16 flex aspect-video items-center justify-center overflow-hidden rounded-3xl border bg-gradient-to-br">
        <div className="text-muted-foreground flex flex-col items-center gap-3">
          <span className="border-border bg-card flex size-14 items-center justify-center rounded-full border">
            <PlayIcon />
          </span>
          <span className="text-sm font-medium">{hero.mediaPlaceholder}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <div className="bg-foreground text-background rounded-2xl px-6 py-8">
          <p className="text-lg leading-snug font-medium">{hero.trust.tagline}</p>
        </div>
        {hero.trust.stats.map((stat) => (
          <div key={stat.label} className="bg-muted rounded-2xl px-6 py-8">
            <p className="text-muted-foreground text-sm">{stat.label}</p>
            <p className="mt-6 text-3xl font-semibold tracking-tight">{stat.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
