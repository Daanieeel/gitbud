import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

/** A custom editor app's icon never changes for a given path, so this is fetched once per app
 * path and kept forever; best-effort (macOS only, `null` elsewhere or if extraction fails). */
export function useCustomEditorIcon(appPath: string | null | undefined) {
  const { data } = useQuery({
    queryKey: queryKeys.customEditorIcon(appPath ?? ""),
    queryFn: () => api.getAppIcon(appPath as string),
    enabled: !!appPath,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? null;
}
