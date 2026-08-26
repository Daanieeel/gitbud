import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ theme = "system", ...props }: ToasterProps) {
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
      toastOptions={{ classNames: { title: "whitespace-pre-line" } }}
      {...props}
    />
  );
}

export { Toaster };
