import type { ReactNode } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

type Tone = 'info' | 'warning' | 'error';

const TONE_STYLES: Record<Tone, string> = {
  info: 'bg-surface-2 border-line',
  warning: 'bg-cream-soft border-cream',
  error: 'bg-danger-soft border-danger/25',
};

const TONE_ICONS: Record<Tone, ReactNode> = {
  info: <Info className="mt-px size-4 shrink-0 text-slate" aria-hidden="true" />,
  warning: <AlertTriangle className="mt-px size-4 shrink-0 text-orange-text" aria-hidden="true" />,
  error: <XCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden="true" />,
};

const TONE_PREFIX: Record<Tone, string> = { info: 'Note', warning: 'Warning', error: 'Error' };

/** Status message with an icon and a spoken prefix, so meaning never depends on colour alone. */
export function Notice({ tone = 'info', title, children, live = true }: { tone?: Tone; title?: string; children: ReactNode; live?: boolean }) {
  return (
    <div
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
      className={`flex gap-2.5 rounded-2xl border px-3.5 py-3 text-[13px] leading-snug ${TONE_STYLES[tone]}`}
    >
      {TONE_ICONS[tone]}
      <div className="min-w-0">
        <span className="sr-only">{TONE_PREFIX[tone]}: </span>
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}
