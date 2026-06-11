"use client";
import { useEffect, useState } from "react";

/** null until mounted (avoids SSR/hydration mismatch), then true/false by viewport. */
export function useIsMobile(query = "(max-width: 767px)"): boolean | null {
  const [m, setM] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [query]);
  return m;
}
