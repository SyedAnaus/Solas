import { setWorkerUrl } from 'maplibre-gl';
// MapLibre 6 resolves its worker as a sibling of its own module via import.meta.url, which a
// bundler cannot see. Emitting the worker as a hashed asset and registering it keeps tile parsing
// working under the GitHub Pages base path.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

setWorkerUrl(workerUrl);
