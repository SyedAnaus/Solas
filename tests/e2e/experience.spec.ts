import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Exercise the committed Cork dataset and real WebGL overlays. Remote basemap hosts are
// deliberately unavailable, so checks stay repeatable and cover the offline fallback too.
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
});

const routeCards = (page: Page) => page.getByRole('list', { name: 'Route options' }).getByRole('button');

async function expandSheet(page: Page) {
  const handle = page.locator('[data-sheet-handle]');
  if (await handle.count()) {
    await handle.focus();
    await handle.press('ArrowUp');
    await expect(page.getByTestId('bottom-sheet')).toHaveAttribute('data-detent', 'large');
  }
}

async function assertFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const planner = page.locator('#planner');
  expect(await planner.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.target) }))).toEqual([]);
}

test('empty planner, all route modes, options and evidence fit and remain accessible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('combobox', { name: /^Start/ })).toBeEnabled();
  await expandSheet(page);
  await assertFits(page);
  await assertAccessible(page);
  await page.getByRole('button', { name: /Try UCC/ }).click();
  await expect(routeCards(page)).toHaveCount(2);
  await expect(routeCards(page).filter({ hasText: 'Better lit' })).toHaveAttribute('aria-pressed', 'true');
  await assertAccessible(page);

  for (const mode of ['Fastest', 'Better lit', 'Easier', 'Step-free']) {
    await page.getByRole('radio', { name: mode, exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked();
    await expect(page.getByRole('list', { name: 'Route options' }).locator('button[aria-pressed="true"]')).toHaveCount(1);
    expect(await routeCards(page).count()).toBeGreaterThan(0);
    await assertFits(page);
  }

  await page.getByRole('button', { name: /^Options/ }).click();
  await expect(page.getByRole('switch', { name: 'Prefer gentler slopes' })).toBeDisabled();
  await page.getByRole('switch', { name: 'Avoid steps' }).click();
  await expect(page.getByRole('switch', { name: 'Avoid steps' })).toBeChecked();
  await assertAccessible(page);
  await page.getByRole('button', { name: /^Options/ }).click();

  await page.getByRole('button', { name: /^Route details/ }).click();
  await expect(page.getByRole('heading', { name: /route$/, level: 2 })).toBeFocused();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: /Where this evidence comes from/ }).click();
  await expect(page.getByText(/OpenStreetMap contributors \(ODbL\), retrieved/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open in Google Maps/ })).toHaveAttribute('href', /^https:\/\/www.google.com\/maps\/dir/);
  await assertFits(page);
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Routes', exact: true }).click();
  await expect(routeCards(page).first()).toBeAttached();
  await expect(page.locator('#route-details-button')).toBeFocused();
  expect(errors).toEqual([]);
});

test('skip navigation preserves the trip and map alternatives remain independently tappable', async ({ page }) => {
  await page.goto('./#from=ucc-quad&to=parnell-place');
  await expect(routeCards(page)).toHaveCount(2);
  await page.getByRole('link', { name: 'Skip to route planner' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#from=ucc-quad&to=parnell-place$/);
  await expect(page.locator('#planner')).toBeFocused();
  await page.getByRole('button', { name: 'Show the whole route' }).click();
  const callouts = page.locator('.solas-callout');
  await expect(callouts).toHaveCount(2);
  await expect.poll(async () => callouts.evaluateAll((els) => {
    const [a, b] = els.map((el) => el.getBoundingClientRect());
    return Boolean(a && b && (a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
  })).toBe(true);
  await callouts.filter({ hasText: 'Fastest' }).click();
  await expect(callouts.filter({ hasText: 'Fastest' })).toHaveAttribute('aria-pressed', 'true');
});

test('about dialog traps focus, closes with Escape and persists reduced motion in light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./#from=ucc-quad&to=parnell-place');
  await expect(routeCards(page)).toHaveCount(2);
  expect(await page.locator('html').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('light');
  const trigger = page.getByRole('button', { name: 'About Solas, data and settings' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'About Solas' });
  await expect(dialog).toBeVisible();
  await assertAccessible(page);
  await dialog.getByRole('switch', { name: 'Reduce motion' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    await expect(dialog).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await trigger.click();
  await expect(dialog.getByRole('switch', { name: 'Reduce motion' })).toBeDisabled();
});

test('loading and failed data are truthful and recover with retry', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/data/cork/manifest.json', async (route) => {
    await gate;
    await route.fulfill({ status: 503, body: 'Unavailable' });
  });
  await page.goto('./');
  await expect(page.getByRole('status')).toContainText('Loading Cork walking data');
  await expect(page.getByRole('combobox', { name: /^Start/ })).toBeDisabled();
  await assertFits(page);
  release();
  await expect(page.getByText('Walking data unavailable', { exact: true })).toBeVisible();
  await expect(routeCards(page)).toHaveCount(0);
  await assertAccessible(page);
  await page.unroute('**/data/cork/manifest.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('combobox', { name: /^Start/ })).toBeEnabled();
});

test('sheet tap, drag and keyboard resizing preserve routes and hide collapsed fields', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'Bottom sheet is the mobile layout');
  await page.goto('./#from=ucc-quad&to=parnell-place');
  await expect(routeCards(page)).toHaveCount(2);
  const sheet = page.getByTestId('bottom-sheet');
  const handle = page.locator('[data-sheet-handle]');
  await handle.tap();
  await expect(sheet).toHaveAttribute('data-detent', 'large');
  await handle.press('ArrowDown');
  await handle.press('ArrowDown');
  await expect(sheet).toHaveAttribute('data-detent', 'peek');
  expect(await page.getByRole('combobox', { name: /^Start/ }).evaluate((el) => Boolean(el.closest('[inert]')))).toBe(true);
  await handle.press('Tab');
  expect(await page.locator('body').evaluate(() => Boolean(document.activeElement?.closest('[inert]')))).toBe(false);
  await handle.tap();
  await expect(sheet).toHaveAttribute('data-detent', 'medium');
  await expect(handle).toBeVisible();
  const bounds = await handle.boundingBox();
  if (!bounds) throw new Error('Sheet handle has no bounds');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2, 75, { steps: 12 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-detent', 'large');
  await expect(routeCards(page).filter({ hasText: 'Better lit' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: /^Start/ }).selectOption('__pick');
  await expect(sheet).toHaveAttribute('data-detent', 'peek');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Tap the map to set your start', { exact: true })).toHaveCount(0);
});
