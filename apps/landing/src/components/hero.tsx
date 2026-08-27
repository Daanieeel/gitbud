import Image from "next/image";
import Link from "next/link";
import { Button } from "@gitbud/ui/button";
import { getMessages } from "@/i18n/get-messages";
import { DownloadButton, type ReleaseAssets } from "@/components/download-button";
import { githubFetch } from "@/lib/github";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
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

async function getReleaseAssets(): Promise<ReleaseAssets> {
  try {
    const res = await githubFetch("https://api.github.com/repos/Daanieeel/gitbud/releases/latest");
    if (!res.ok) return EMPTY_ASSETS;
    // SAFETY: GitHub's releases endpoint always returns an assets array of {name, browser_download_url}.
    const release = (await res.json()) as GitHubRelease;
    const find = (pattern: RegExp) =>
      release.assets.find((asset) => pattern.test(asset.name))?.browser_download_url ?? null;

    return {
      macArm: find(/_aarch64\.dmg$/i),
      macIntel: find(/_x(64|86_64)\.dmg$/i),
      windowsExe: find(/-setup\.exe$/i),
      windowsMsi: find(/\.msi$/i),
      linuxAppImage: find(/\.AppImage$/i),
      linuxDeb: find(/\.deb$/i),
      linuxRpm: find(/\.rpm$/i),
    };
  } catch {
    return EMPTY_ASSETS;
  }
}

export async function Hero() {
  const { hero } = getMessages();
  const assets = await getReleaseAssets();

  return (
    <section className="mx-auto max-w-7xl px-6 pt-36 pb-16 lg:pt-40 xl:pt-48">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto] lg:items-start lg:gap-8">
        <div>
          <p className="text-muted-foreground text-xs uppercase">{hero.eyebrow}</p>
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

      <div className="bg-accent border-border relative mt-16 aspect-video overflow-hidden rounded-3xl border">
        <Image
          src="/screenshots.png"
          alt={hero.mediaPlaceholder}
          fill
          priority
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
