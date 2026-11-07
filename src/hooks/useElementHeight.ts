import { useCallback, useRef, useState } from 'react';

/**
 * Live height of an element (0 when absent). Returns a callback ref to attach to the element.
 * Used to keep map padding and attribution clear of floating panels.
 */
export function useElementHeight<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [height, setHeight] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setHeight(0);
      return;
    }
    setHeight(el.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.current.observe(el);
  }, []);
  return [ref, height];
}
