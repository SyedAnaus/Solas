import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { syntheticFetch } from '../fixtures/syntheticDataset';
import { setViewportWidth } from '../setup';

// jsdom has no WebGL, so MapLibre is replaced with a minimal stand-in.
vi.mock('maplibre-gl', () => import('../mocks/maplibre'));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

import App from '../../src/App';

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '';
});

async function renderWithRoute(from = 'syn-a', to = 'syn-c') {
  vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
  const user = userEvent.setup();
  render(<App />);
  const start = await screen.findByRole('combobox', { name: 'Start' });
  await waitFor(() => expect(start).toBeEnabled());
  await user.selectOptions(start, from);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Destination' }), to);
  return user;
}

const card = (name: RegExp) => screen.getByRole('button', { name });
const FASTEST = /^Fastest route, about 3 min, 200 m/;
const BETTER_LIT = /^Better lit route, about 6 min, 460 m, \+3 min compared with the fastest/;

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
  });

  it('explains when walking data cannot be loaded and offers a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<App />);
    expect(await screen.findByText(/walking data unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fastest route/i })).not.toBeInTheDocument();
  });
});

describe('fastest vs better lit (synthetic data)', () => {
  it('shows both routes side by side and selects the better-lit one by default', async () => {
    await renderWithRoute();
    const fastest = await screen.findByRole('button', { name: FASTEST });
    const better = card(BETTER_LIT);
    expect(better).toHaveAttribute('aria-pressed', 'true');
    expect(fastest).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Better lit route' })).toBeInTheDocument();
    // Lighting evidence: mapped unlit and unknown are reported separately, never merged.
    expect(fastest).toHaveAccessibleName(/Mapped unlit 50%, Unknown 50%/);
    // Synthetic fixtures are always labelled.
    expect(screen.getAllByText(/synthetic test data/i).length).toBeGreaterThan(0);
    expect(window.location.hash).toBe('#from=syn-a&to=syn-c');
  });

  it('keeps the card, details and selection in sync', async () => {
    const user = await renderWithRoute();
    await user.click(await screen.findByRole('button', { name: FASTEST }));
    expect(card(FASTEST)).toHaveAttribute('aria-pressed', 'true');
    expect(card(BETTER_LIT)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Fastest route' })).toBeInTheDocument();
    // Changing the preference re-plans and re-selects the recommended route.
    await user.click(screen.getByRole('radio', { name: 'Fastest' }));
    await waitFor(() => expect(card(FASTEST)).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('radio', { name: 'Better lit' }));
    await waitFor(() => expect(card(BETTER_LIT)).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('heading', { name: 'Better lit route' })).toBeInTheDocument();
  });

  it('respects the detour cap and only shows longer routes on request, with a warning', async () => {
    const user = await renderWithRoute();
    await screen.findByRole('button', { name: BETTER_LIT });
    await user.click(screen.getByRole('button', { name: /fine-tune/i }));
    await user.click(screen.getByRole('radio', { name: '3 min' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: BETTER_LIT })).not.toBeInTheDocument());
    expect(screen.getByText('Better-lit route is longer than your limit')).toBeInTheDocument();
    expect(card(FASTEST)).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('switch', { name: /show longer alternatives/i }));
    const longer = await screen.findByRole('button', { name: /longer than your time limit/ });
    expect(within(longer).getByText(/over your time limit/i)).toBeInTheDocument();
    // A route beyond the cap is never selected automatically.
    expect(longer).toHaveAttribute('aria-pressed', 'false');
  });

  it('says so when the fastest route is already the best lit', async () => {
    vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
    window.location.hash = '#from=syn-d&to=syn-e';
    render(<App />);
    const only = await screen.findByRole('button', { name: /^Fastest, also better lit route/ });
    expect(only).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('The fastest route is also the best lit we found')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /route, about/ })).toHaveLength(1);
  });

  it('reports an unreachable destination instead of drawing a route', async () => {
    await renderWithRoute('syn-a', 'syn-island');
    expect(await screen.findByText(/no route found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /route, about/ })).not.toBeInTheDocument();
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

  it('collapses the planner on phones once a route is shown, and can reopen it', async () => {
    setViewportWidth(390);
    window.location.hash = '#from=syn-a&to=syn-c';
    vi.stubGlobal('fetch', vi.fn(syntheticFetch()));
    const user = userEvent.setup();
    render(<App />);
    const edit = await screen.findByRole('button', { name: /edit start and destination/i });
    expect(screen.queryByRole('combobox', { name: 'Start' })).not.toBeInTheDocument();
    await user.click(edit);
    expect(screen.getByRole('combobox', { name: 'Start' })).toHaveValue('syn-a');
  });
});
