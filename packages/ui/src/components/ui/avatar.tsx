import { useEffect, useRef, useState } from "react";
import { useAvatarCache } from "../../lib/avatar-cache";
import { cn } from "../../lib/utils";

interface AvatarProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

// A slow/flaky connection never fires `<img onError>` — the request just hangs indefinitely
// rather than failing outright — so a bad-but-not-dead network would otherwise never fall back
// to the cached copy at all. This races the live load against a timeout and falls back once it
// elapses, same as a real load failure would.
const LOAD_TIMEOUT_MS = 4_000;

/** A user's avatar image, sourced from whichever host (GitHub today; GitLab/Bitbucket to
 * follow) already gave us an avatar URL alongside their profile. Renders nothing if none was
 * available, so callers don't need their own presence check.
 *
 * Opportunistically warms a local cache of the image (fire-and-forget, doesn't block the normal
 * network `<img>` load) and falls back to that cached copy if the live URL fails to load or
 * simply hasn't loaded within `LOAD_TIMEOUT_MS`, e.g. offline or slow, after having seen this
 * avatar at least once before. See `AvatarCacheProvider` for plugging in the actual cache. */
export function Avatar({ src, alt, className }: AvatarProps) {
  const { cacheAvatar, getCachedAvatar } = useAvatarCache();
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    setFallbackSrc(null);
    setFailed(false);
    loadedRef.current = false;
    if (!src) return;
    cacheAvatar(src);
    const timer = setTimeout(() => {
      if (loadedRef.current) return;
      setFailed(true);
      void getCachedAvatar(src).then((cached) => {
        if (cached) setFallbackSrc(cached);
      });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [src, cacheAvatar, getCachedAvatar]);

  if (!src) return null;

  return (
    <img
      src={failed && fallbackSrc ? fallbackSrc : src}
      alt={alt}
      className={cn("shrink-0 rounded-full", className)}
      onLoad={() => {
        loadedRef.current = true;
      }}
      onError={() => {
        if (failed) return;
        setFailed(true);
        void getCachedAvatar(src).then((cached) => {
          if (cached) setFallbackSrc(cached);
        });
      }}
    />
  );
}
