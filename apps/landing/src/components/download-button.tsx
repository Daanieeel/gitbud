"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { AppleMark, LinuxMark, WindowsMark } from "@gitbud/ui/brand-logo";

export interface ReleaseAssets {
  macArm: string | null;
  macIntel: string | null;
  windowsExe: string | null;
  windowsMsi: string | null;
  linuxAppImage: string | null;
  linuxDeb: string | null;
  linuxRpm: string | null;
}

interface DownloadLabels {
  fallback: string;
  mac: string;
  windows: string;
  linux: string;
  moreOptions: string;
}

type DetectedOs = "mac" | "windows" | "linux" | "unknown";

const RELEASES_URL = "https://github.com/Daanieeel/gitbud/releases/latest";

interface DownloadItem {
  label: string;
  href: string;
}

function hasHref(item: { label: string; href: string | null }): item is DownloadItem {
  return item.href !== null;
}

export function DownloadButton({
  assets,
  labels,
}: {
  assets: ReleaseAssets;
  labels: DownloadLabels;
}) {
  const [os, setOs] = useState<DetectedOs>("unknown");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac/.test(ua)) setOs("mac");
    else if (/Win/.test(ua)) setOs("windows");
    else if (/Linux/.test(ua)) setOs("linux");
    setMounted(true);
  }, []);

  const primary = !mounted
    ? { label: labels.fallback, href: RELEASES_URL }
    : os === "mac"
      ? { label: labels.mac, href: assets.macArm ?? assets.macIntel ?? RELEASES_URL }
      : os === "windows"
        ? { label: labels.windows, href: assets.windowsExe ?? assets.windowsMsi ?? RELEASES_URL }
        : os === "linux"
          ? { label: labels.linux, href: assets.linuxAppImage ?? assets.linuxDeb ?? RELEASES_URL }
          : { label: labels.fallback, href: RELEASES_URL };

  return (
    <div className="inline-flex">
      <Button size="lg" className="rounded-r-none px-5" asChild>
        <Link href={primary.href}>{primary.label}</Link>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="lg"
            className="border-primary-foreground/20 rounded-l-none border-l px-3"
            aria-label={labels.moreOptions}
          >
            <ChevronDown className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <DownloadGroup
            label="macOS"
            icon={AppleMark}
            items={[
              { label: "Apple Silicon", href: assets.macArm },
              { label: "Intel", href: assets.macIntel },
            ]}
          />
          <DownloadGroup
            label="Windows"
            icon={WindowsMark}
            items={[
              { label: "Installer (.exe)", href: assets.windowsExe },
              { label: "MSI", href: assets.windowsMsi },
            ]}
          />
          <DownloadGroup
            label="Linux"
            icon={LinuxMark}
            items={[
              { label: "AppImage", href: assets.linuxAppImage },
              { label: ".deb", href: assets.linuxDeb },
              { label: ".rpm", href: assets.linuxRpm },
            ]}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DownloadGroup({
  label,
  icon: Icon,
  items,
}: {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: { label: string; href: string | null }[];
}) {
  const available = items.filter(hasHref);
  if (available.length === 0) return null;

  return (
    <div className="py-1">
      <p className="text-muted-foreground flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
        <Icon className="size-3.5" />
        {label}
      </p>
      {available.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="hover:bg-accent hover:text-accent-foreground flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          {item.label}
          <Download className="text-muted-foreground size-3.5" />
        </Link>
      ))}
    </div>
  );
}
