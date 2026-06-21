import { useCallback, useEffect, useState } from "react";

/**
 * A set of collapsed item ids (days, groups…), persisted in localStorage[key].
 * SSR-safe: starts empty to match the server render, then hydrates from storage
 * after mount (same approach as useResizableWidth).
 */
export function useCollapsed(key: string): {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
} {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const arr: unknown = JSON.parse(stored);
        if (Array.isArray(arr)) {
          setIds(new Set(arr.filter((x): x is string => typeof x === "string")));
        }
      }
    } catch {
      // ignore unavailable / malformed localStorage
    }
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [key],
  );

  const isCollapsed = useCallback((id: string) => ids.has(id), [ids]);
  return { isCollapsed, toggle };
}
