import type { ImageDiff } from "@/lib/types";

interface ImageDiffViewProps {
  path: string;
  imageDiff: ImageDiff | null;
}

function Slot({ label, src }: { label: string; src: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {src ? (
        <img src={src} alt={label} className="max-h-full max-w-full rounded border border-border object-contain" />
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
