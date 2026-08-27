import { HeartHandshake, Rocket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@gitbud/ui/badge";
import { Button } from "@gitbud/ui/button";
import { getMessages } from "@/i18n/get-messages";
import { DownloadButton, type ReleaseAssets } from "@/components/download-button";
import { githubFetch } from "@/lib/github";

const DISCORD_DM_URL = "https://discord.com/users/427107119406514176";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

const EMPTY_ASSETS: ReleaseAssets = {
  macArm: null,
  macIntel: null,
  windowsExe: null,
  windowsMsi: null,
  linuxAppImage: null,
  linuxDeb: null,
  linuxRpm: null,
};

async function getLatestRelease(): Promise<{ version: string | null; assets: ReleaseAssets }> {
  try {
    const res = await githubFetch("https://api.github.com/repos/Daanieeel/gitbud/releases/latest");
    if (!res.ok) return { version: null, assets: EMPTY_ASSETS };
    // SAFETY: GitHub's releases endpoint always returns an assets array of {name, browser_download_url}.
    const release = (await res.json()) as GitHubRelease;
    const find = (pattern: RegExp) =>
      release.assets.find((asset) => pattern.test(asset.name))?.browser_download_url ?? null;

    return {
      version: release.tag_name,
      assets: {
        macArm: find(/_aarch64\.dmg$/i),
        macIntel: find(/_x(64|86_64)\.dmg$/i),
        windowsExe: find(/-setup\.exe$/i),
        windowsMsi: find(/\.msi$/i),
        linuxAppImage: find(/\.AppImage$/i),
        linuxDeb: find(/\.deb$/i),
        linuxRpm: find(/\.rpm$/i),
      },
    };
  } catch {
    return { version: null, assets: EMPTY_ASSETS };
  }
}

export async function Hero() {
  const { hero } = getMessages();
  const { version, assets } = await getLatestRelease();

  return (
    <section className="mx-auto max-w-7xl px-6 pt-30 pb-16 sm:pt-36 lg:pt-40 xl:pt-48">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-8">
        <div>
          <Link
            href="https://github.com/Daanieeel/gitbud/releases"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Badge variant="positive" className="gap-1.5 px-3 py-1 text-sm">
              <Rocket className="size-3.5" />
              {version ?? "In early development"}
            </Badge>
          </Link>
          <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            {hero.headline[0]} <br className="hidden md:block" />
            {hero.headline[1]}
          </h1>
        </div>
        <div className="flex flex-col gap-10 lg:gap-6 lg:pt-12">
          <p className="text-muted-foreground w-full text-base text-justify lg:max-w-sm">
            {hero.description}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <DownloadButton assets={assets} labels={hero.download} className="w-full sm:w-auto" />
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" asChild>
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

      <div className="border-border bg-muted mt-6 flex items-center gap-3 rounded-2xl border px-5 py-4 sm:mt-16">
        <HeartHandshake className="text-muted-foreground size-5 shrink-0" />
        <p className="text-sm">
          GitBud isn&apos;t notarized by Apple yet. We&apos;re looking for sponsors to cover a paid
          Apple Developer account.{" "}
          <Link
            href={DISCORD_DM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Message me on Discord
          </Link>
        </p>
      </div>

      <div className="bg-accent border-border relative mt-6 aspect-video overflow-hidden rounded-3xl border">
        <Image
          src="/screenshots.webp"
          alt={hero.mediaPlaceholder}
          fill
          priority
          fetchPriority="high"
          sizes="(min-width: 1280px) 1232px, 100vw"
          className="scale-110 object-cover"
        />
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
