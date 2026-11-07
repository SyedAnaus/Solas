import { useId } from 'react';

/** Solas logo: a lamp glow over a footpath arc. Decorative; the wordmark carries the name. */
export function BrandMark({ size = 36 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#ffe2a3" />
          <stop offset="0.45" stopColor="#f8c15c" />
          <stop offset="1" stopColor="#9d7bff" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0b1029" />
      <circle cx="32" cy="27" r="11" fill={`url(#${gradientId})`} />
      <path d="M14 50c6-6 12-8 18-8s12 2 18 8" fill="none" stroke="#b79cff" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}
