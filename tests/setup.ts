import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom has no matchMedia. Tests run with a desktop-width viewport by default; call
 * `setViewportWidth(390)` in a test to exercise the phone layout.
 */
let viewportWidth = 1280;
export function setViewportWidth(width: number) {
  viewportWidth = width;
}

function evaluate(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min) return viewportWidth >= Number(min[1]);
  const max = /\(max-width:\s*(\d+)px\)/.exec(query);
  if (max) return viewportWidth <= Number(max[1]);
  return false;
}

beforeEach(() => {
  viewportWidth = 1280;
  window.matchMedia = (query: string) =>
    ({
      matches: evaluate(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});

afterEach(() => {
  cleanup();
});
