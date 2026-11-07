import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no WebGL, so MapLibre is replaced with a minimal stand-in.
vi.mock('maplibre-gl', () => import('../mocks/maplibre'));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import App from '../../src/App';

describe('App shell', () => {
  it('renders the brand, planner region and a labelled map', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Solas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Route planner' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /map of the supported cork walking area/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('toggles between dark and light themes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<App />);
    const toggle = screen.getByRole('button', { name: /switch to light theme/i });
    await userEvent.click(toggle);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
