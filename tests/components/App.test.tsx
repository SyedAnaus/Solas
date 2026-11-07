import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { syntheticFetch } from '../fixtures/syntheticDataset';

// jsdom has no WebGL, so MapLibre is replaced with a minimal stand-in.
vi.mock('maplibre-gl', () => import('../mocks/maplibre'));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import App from '../../src/App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

describe('App shell', () => {
  it('renders the brand, planner region and a labelled map', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Solas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Route planner' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /map of the supported cork walking area/i })).toBeInTheDocument();
  });

  it('toggles between dark and light themes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /switch to light theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button', { name: /switch to dark theme/i })).toBeInTheDocument();
  });

  it('explains when walking data cannot be loaded and offers a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<App />);
    expect(await screen.findAllByText(/walking data unavailable/i)).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /try again/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /fastest route/i })).not.toBeInTheDocument();
  });
});

describe('planning a route (synthetic data)', () => {
  it('computes and shows the fastest route after choosing two places', async () => {
    vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
    const user = userEvent.setup();
    render(<App />);
    const start = await screen.findByRole('combobox', { name: 'Start' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.selectOptions(start, 'syn-a');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Destination' }), 'syn-c');

    const cards = await screen.findAllByRole('button', { name: /fastest route: about 3 min, 200 m/i });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    // The synthetic fixture must be labelled as such, never as real Cork data.
    expect(screen.getAllByText(/synthetic test data/i).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#from=syn-a&to=syn-c');
  });

  it('reports an unreachable destination instead of drawing a route', async () => {
    vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
    const user = userEvent.setup();
    render(<App />);
    const start = await screen.findByRole('combobox', { name: 'Start' });
    await waitFor(() => expect(start).toBeEnabled());
    await user.selectOptions(start, 'syn-a');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Destination' }), 'syn-island');
    const notices = await screen.findAllByText(/no route found/i);
    expect(notices.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /fastest route/i })).not.toBeInTheDocument();
  });

  it('restores start and destination from a shared link and swaps them', async () => {
    window.location.hash = '#from=syn-c&to=syn-a';
    vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
    const user = userEvent.setup();
    render(<App />);
    const start = await screen.findByRole('combobox', { name: 'Start' });
    await waitFor(() => expect(start).toHaveValue('syn-c'));
    const form = screen.getByRole('form', { name: /choose start and destination/i });
    await user.click(within(form).getByRole('button', { name: /swap start and destination/i }));
    expect(start).toHaveValue('syn-a');
    expect(screen.getByRole('combobox', { name: 'Destination' })).toHaveValue('syn-c');
  });
});
