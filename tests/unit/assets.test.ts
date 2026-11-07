import { describe, expect, it } from 'vitest';
import { assetUrl } from '../../src/lib/assets';

describe('assetUrl', () => {
  it('joins GitHub Pages project base paths', () => {
    expect(assetUrl('data/cork.json', '/Solas/')).toBe('/Solas/data/cork.json');
    expect(assetUrl('/data/cork.json', '/Solas/')).toBe('/Solas/data/cork.json');
    expect(assetUrl('data/cork.json', '/Solas')).toBe('/Solas/data/cork.json');
  });

  it('works at the domain root', () => {
    expect(assetUrl('favicon.svg', '/')).toBe('/favicon.svg');
  });
});
