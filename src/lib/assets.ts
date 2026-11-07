/**
 * Resolve a file in `public/` against Vite's base URL, so it works both locally and at
 * https://OWNER.github.io/REPOSITORY/. Never use absolute "/data/..." paths in this app.
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = path.replace(/^\/+/, '');
  return `${cleanBase}${cleanPath}`;
}
