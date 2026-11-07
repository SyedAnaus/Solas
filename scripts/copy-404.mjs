#!/usr/bin/env node
// GitHub Pages serves 404.html for unknown paths. Copying index.html there means a mistyped or
// stale deep link under the project URL still loads Solas instead of a GitHub error page.
import { copyFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
console.log('copied dist/index.html -> dist/404.html');
