#!/usr/bin/env node
/**
 * Post-build guard for the static GitHub Pages artefact.
 * 1. index.html must reference assets under the configured base path (nested project URL).
 * 2. No file in dist/ may contain something that looks like a credential.
 * 3. 404.html must exist so unknown paths still load the app.
 * Exits non-zero on any problem.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const base = process.env.BASE_PATH ?? '/Solas/';
const problems = [];

if (!existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('./') || ref.startsWith('#') || ref.startsWith('data:')) continue;
  if (!ref.startsWith(base)) problems.push(`index.html references "${ref}" outside base "${base}"`);
}
if (!existsSync(join(DIST, '404.html'))) problems.push('dist/404.html is missing');

const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/sk-[A-Za-z0-9_-]{20,}/, 'API secret key (sk-...)'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/[?&](api_?key|access_token|key)=[A-Za-z0-9_-]{16,}/i, 'credential in URL query'],
  [/pk\.eyJ[A-Za-z0-9_-]{20,}/, 'Mapbox token'],
];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|mjs|css|html|json|txt|svg|map)$/.test(name)) {
      const text = readFileSync(path, 'utf8');
      for (const [pattern, label] of SECRET_PATTERNS) {
        const match = text.match(pattern);
        if (match) problems.push(`${relative(DIST, path)}: possible ${label}: "${match[0].slice(0, 12)}…"`);
      }
    }
  }
}
walk(DIST);

if (problems.length) {
  console.error(`check-dist found ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-dist: OK (base ${base}, ${refs.length} index.html references checked, no credential patterns found)`);
