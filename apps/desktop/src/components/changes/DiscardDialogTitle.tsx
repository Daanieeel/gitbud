import { useLayoutEffect, useRef, useState } from "react";
import { abbreviateFilePath, type PathSegment } from "@/lib/abbreviatePath";

interface DiscardDialogTitleProps {
  path: string;
  className?: string;
}

export function DiscardDialogTitle({ path, className }: DiscardDialogTitleProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [segments, setSegments] = useState<PathSegment[]>(() =>
    abbreviateFilePath(path, {
      maxChars: 45,
      prefix: 'Discard changes to "',
      suffix: '"?',
    }),
  );

  useLayoutEffect(() => {
    if (!path) return;

    const update = () => {
      const el = containerRef.current;
      if (!el) return;

      const header = el.closest("header") ?? el.parentElement;
      const computed = window.getComputedStyle(el);
      const font = `${computed.fontWeight || "600"} ${computed.fontSize || "18px"} ${computed.fontFamily || "sans-serif"}`;

      // Available width: header clientWidth minus clearance for the dialog close button
      const headerWidth = header ? header.clientWidth : el.clientWidth;
      const availableWidth = Math.max(120, (headerWidth || 380) - 36);

      const candidate = abbreviateFilePath(path, {
        maxWidth: availableWidth,
        font,
        prefix: 'Discard changes to "',
        suffix: '"?',
      });
      setSegments(candidate);
    };

    update();

    const parent = containerRef.current?.parentElement;
    if (parent) {
      const observer = new ResizeObserver(() => {
        update();
      });
      observer.observe(parent);
      return () => observer.disconnect();
    }
  }, [path]);

  if (!path) {
    return <span className={className}>Discard changes?</span>;
  }

  return (
    <span ref={containerRef} className={className} title={path}>
      Discard changes to &quot;
      {segments.map((seg, i) => (
        <span key={i} className={seg.isAbbreviation ? "opacity-50" : undefined}>
          {seg.text}
        </span>
      ))}
      &quot;?
    </span>
  );
}
