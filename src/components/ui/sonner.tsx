import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useSettingsStore } from "@/store/useSettingsStore";

function Toaster(props: ToasterProps) {
  const theme = useSettingsStore((s) => s.settings.theme);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
