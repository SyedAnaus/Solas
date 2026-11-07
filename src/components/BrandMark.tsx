import { useId } from 'react';

/** Solas mark: a lamp (Pow Orange) above a footpath arc (Bright Slate). Decorative. */
export function BrandMark({ size = 32 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D3D9EB" />
          <stop offset="1" stopColor="#EBE5D3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <circle cx="32" cy="25" r="10" fill="#E05320" />
      <path d="M13 50c6-6.5 12.4-9.5 19-9.5S45 43.5 51 50" fill="none" stroke="#3B4497" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
