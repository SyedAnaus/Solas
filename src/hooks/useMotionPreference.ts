import { useCallback, useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery';

const KEY = 'solas:reduce-motion';

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Reduced motion = the system setting OR the in-app switch (saved per browser, best effort).
 * Mirrors the result to <html data-motion> so CSS transitions and animations switch off too.
 */
export function useMotionPreference(): { reduceMotion: boolean; userReduce: boolean; systemReduce: boolean; setUserReduce: (v: boolean) => void } {
  const systemReduce = usePrefersReducedMotion();
  const [userReduce, setUser] = useState(readSaved);
  const reduceMotion = systemReduce || userReduce;

  useEffect(() => {
    if (reduceMotion) document.documentElement.setAttribute('data-motion', 'reduce');
    else document.documentElement.removeAttribute('data-motion');
  }, [reduceMotion]);

  const setUserReduce = useCallback((v: boolean) => {
    setUser(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // Storage unavailable: the setting still applies for this visit.
    }
  }, []);

  return { reduceMotion, userReduce, systemReduce, setUserReduce };
}
