import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { BrandMark } from './components/BrandMark';
import { IconButton } from './components/IconButton';
import { Notice } from './components/Notice';
import { MapView, type MapStatus } from './features/map/MapView';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: 'loading' });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-ink">
      <a
        href="#planner"
        className="sr-only-focusable absolute left-3 top-3 z-50 rounded-lg bg-accent px-3 py-2 font-semibold text-accent-contrast"
      >
        Skip to route planner
      </a>

      <MapView theme={theme} onStatusChange={setMapStatus} ariaLabel="Map of the supported Cork walking area" />

      <section
        id="planner"
        aria-label="Route planner"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3 sm:p-4 md:inset-x-auto md:left-0 md:w-[420px]"
      >
        <div className="pointer-events-auto rounded-2xl border border-line bg-surface-glass p-3 shadow-float backdrop-blur-xl sm:p-4">
          <header className="flex items-center gap-3">
            <BrandMark size={40} />
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">Solas</h1>
              <p className="truncate text-sm text-ink-muted">The better walk is worth seeing.</p>
            </div>
            <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
            </IconButton>
          </header>

          <div className="mt-3 space-y-2">
            <Notice title="Cork walking data not loaded yet">
              Route planning arrives with the OpenStreetMap walking network for the UCC ↔ Parnell Place corridor.
            </Notice>
            {mapStatus.kind === 'unsupported' && <Notice tone="error">{mapStatus.message}</Notice>}
            {mapStatus.kind === 'ready' && mapStatus.basemap.kind === 'offline' && (
              <Notice tone="warning" title="Basemap unavailable">
                Map tiles could not be loaded, so only Solas&apos;s own walking network is shown.
              </Notice>
            )}
            {mapStatus.kind === 'ready' && mapStatus.tilesDegraded && mapStatus.basemap.kind === 'remote' && (
              <Notice tone="warning">Some map tiles failed to load. Routes are unaffected.</Notice>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
