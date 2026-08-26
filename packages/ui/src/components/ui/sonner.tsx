import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ theme = "system", ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        // SAFETY: these are CSS custom properties (not standard style props), which
        // `React.CSSProperties` doesn't model; consumed via `var(...)` in styles.css.
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { title: "whitespace-pre-line" } }}
      {...props}
    />
  );
}

export { Toaster };
