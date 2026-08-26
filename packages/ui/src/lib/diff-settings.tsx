import { createContext, useContext, useState, type ReactNode } from "react";

interface DiffSettings {
  fontSize: number;
  diffViewMode: "unified" | "split";
  setDiffViewMode: (mode: "unified" | "split") => void;
}

const DiffSettingsContext = createContext<DiffSettings | null>(null);

/** Wrap the app root with this to plug `DiffView`'s font size / unified-vs-split preference into
 * a persisted, app-wide setting. Without a provider, `DiffView` falls back to an in-memory
 * default that resets on remount. */
export function DiffSettingsProvider({ value, children }: { value: DiffSettings; children: ReactNode }) {
  return <DiffSettingsContext.Provider value={value}>{children}</DiffSettingsContext.Provider>;
}

export function useDiffSettings(): DiffSettings {
  const ctx = useContext(DiffSettingsContext);
  const [localMode, setLocalMode] = useState<"unified" | "split">("unified");
  if (ctx) return ctx;
  return { fontSize: 12, diffViewMode: localMode, setDiffViewMode: setLocalMode };
}
