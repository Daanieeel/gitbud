import { useCallback, useEffect, useRef, useState } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Drag-to-resize width for a side panel, persisted per `storageKey` in localStorage. */
export function useResizableWidth(storageKey: string, defaultWidth: number, min = 160, max = 560) {
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : defaultWidth;
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const onMove = (ev: PointerEvent) => {
        setWidth(clamp(startWidth + (ev.clientX - startX), min, max));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [min, max],
  );

  return { width, onPointerDown };
}
