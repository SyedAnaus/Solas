import { useCallback, useEffect, useState } from 'react';
import type { ThemeName } from '../config/map';

const STORAGE_KEY = 'solas:theme';

function readInitialTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

/**
 * Theme state mirrored to <html data-theme>. The system preference applies until the user picks a
 * theme; only an explicit choice is saved (best effort — storage may be unavailable).
 */
export function useTheme(): { theme: ThemeName; toggleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeName>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode or blocked storage: the theme still applies for this visit.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
