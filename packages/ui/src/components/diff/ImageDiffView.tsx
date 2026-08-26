import { useState } from "react";
import type { ImageDiff } from "./types";

interface ImageDiffViewProps {
  path: string;
  imageDiff: ImageDiff | null;
}

/** Decoded byte length of a `data:...;base64,<payload>` URI, formatted as e.g. "128 KB". */
function formatDataUriSize(src: string): string {
  const payload = src.slice(src.indexOf(",") + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Slot({ label, src }: { label: string; src: string | null }) {
  const [resolution, setResolution] = useState<string | null>(null);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {src ? (
        <>
          <img
            src={src}
            alt={label}
            className="max-h-full max-w-full rounded border border-border object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setResolution(`${img.naturalWidth}×${img.naturalHeight}`);
            }}
          />
          <span className="text-xs text-muted-foreground">
            {resolution ?? "…"} · {formatDataUriSize(src)}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">(none)</span>
      )}
    </div>
  );
}

export function ImageDiffView({ path, imageDiff }: ImageDiffViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-card px-3 py-1.5 text-xs font-medium">
        {path}
      </div>
      {imageDiff ? (
        <div className="flex min-h-0 flex-1">
          <Slot label="Before" src={imageDiff.old} />
          <div className="w-px shrink-0 bg-border" />
          <Slot label="After" src={imageDiff.new} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading image…
        </div>
      )}
    </div>
  );
}
