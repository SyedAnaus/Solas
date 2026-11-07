import type { ReactNode } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

type Tone = 'info' | 'warning' | 'error';

const TONE_STYLES: Record<Tone, string> = {
  info: 'border-line bg-surface-raised text-ink',
  warning: 'border-amber/40 bg-amber-soft text-ink',
  error: 'border-danger/40 bg-danger-soft text-ink',
};

const TONE_ICONS: Record<Tone, ReactNode> = {
  info: <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />,
  warning: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden="true" />,
  error: <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />,
};

const TONE_PREFIX: Record<Tone, string> = { info: 'Note', warning: 'Warning', error: 'Error' };

/** Status message with an icon and a text prefix, so meaning never depends on colour alone. */
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-snug ${TONE_STYLES[tone]}`}
    >
      {TONE_ICONS[tone]}
      <div className="min-w-0">
        <span className="sr-only">{TONE_PREFIX[tone]}: </span>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-ink-muted">{children}</div>
      </div>
    </div>
  );
}
