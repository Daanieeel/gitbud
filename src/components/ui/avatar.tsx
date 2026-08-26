import { useEffect, useState } from "react";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

/** A user's avatar image, sourced from whichever host (GitHub today; GitLab/Bitbucket to
 * follow) already gave us an avatar URL alongside their profile. Renders nothing if none was
 * available, so callers don't need their own presence check.
 *
 * Opportunistically warms a local cache of the image (fire-and-forget, doesn't block the normal
 * network `<img>` load) and falls back to that cached copy if the live URL ever fails to load,
 * e.g. offline, after having seen this avatar at least once before. */
export function Avatar({ src, alt, className }: AvatarProps) {
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFallbackSrc(null);
    setFailed(false);
    if (src) void api.cacheAvatar(src);
  }, [src]);

  if (!src) return null;

  return (
    <img
      src={failed && fallbackSrc ? fallbackSrc : src}
      alt={alt}
      className={cn("shrink-0 rounded-full", className)}
      onError={() => {
        if (failed) return;
        setFailed(true);
        void api.getCachedAvatar(src).then((cached) => {
          if (cached) setFallbackSrc(cached);
        });
      }}
    />
  );
}
