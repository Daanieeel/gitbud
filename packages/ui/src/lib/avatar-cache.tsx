import { createContext, useContext, type ReactNode } from "react";

interface AvatarCache {
  cacheAvatar: (src: string) => void;
  getCachedAvatar: (src: string) => Promise<string | null>;
}

const noopCache: AvatarCache = {
  cacheAvatar: () => {},
  getCachedAvatar: async () => null,
};

const AvatarCacheContext = createContext<AvatarCache>(noopCache);

/** Wrap the app root with this to plug in a platform-specific local avatar cache (e.g. Tauri's
 * `cache_avatar`/`get_cached_avatar` commands). Without a provider, `Avatar` falls back to
 * loading straight from `src` with no offline fallback. */
export function AvatarCacheProvider({ value, children }: { value: AvatarCache; children: ReactNode }) {
  return <AvatarCacheContext.Provider value={value}>{children}</AvatarCacheContext.Provider>;
}

export function useAvatarCache(): AvatarCache {
  return useContext(AvatarCacheContext);
}
