import { useCallback, useEffect, useRef, useState } from "react";
import { clampWidth } from "@/lib/ui/clamp";

/** A panel width (px) that the user resizes by dragging a handle on the panel's
 *  RIGHT edge (drag right ⇒ wider). Loaded from / saved to localStorage[key]. */
export function useResizableWidth(
  key: string,
  opts: { initial: number; min: number; max: number },
): { width: number; onHandleMouseDown: (e: React.MouseEvent) => void } {
  const { initial, min, max } = opts;
  const [width, setWidth] = useState(initial);
  const widthRef = useRef(initial);
  widthRef.current = width;

  // Load the saved width after mount (not in the initializer — avoids an SSR/
  // hydration mismatch between the server's default and the client's stored value).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored != null) {
        const n = Number(stored);
        if (Number.isFinite(n)) setWidth(clampWidth(n, min, max));
      }
    } catch {
      // ignore unavailable localStorage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        setWidth(clampWidth(startWidth + (ev.clientX - startX), min, max));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = prevUserSelect;
        try {
          window.localStorage.setItem(key, String(widthRef.current));
        } catch {
          // ignore
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [key, min, max],
  );

  return { width, onHandleMouseDown };
}
