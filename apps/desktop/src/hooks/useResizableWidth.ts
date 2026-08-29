import { useCallback, useEffect, useRef, useState } from "react";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Drag-to-resize width for a side panel, persisted per `storageKey` in localStorage. `invert`
 * flips which drag direction grows the panel — every existing panel has its resize handle on
 * its right edge (growing as the pointer moves right), but a panel resized from its *left* edge
 * (e.g. a right-hand sidebar) needs the opposite: moving the pointer left should grow it. */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  min = 160,
  max = 560,
  invert = false,
) {
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
        const delta = ev.clientX - startX;
        setWidth(clamp(startWidth + (invert ? -delta : delta), min, max));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [min, max, invert],
  );

  return { width, onPointerDown };
}
