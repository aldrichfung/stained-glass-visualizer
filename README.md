# Stained Glass Visualizer

A dynamic, configurable music visualizer that transforms any reference image
into a geometric stained-glass panel and animates it in reaction to your audio.

## Features

- **Audio in** — upload any audio file, hit the built-in generative demo
  tone, or **listen live**: capture this device's audio (share your screen
  or a browser tab with sound — Spotify, YouTube, Apple Music, anything the
  OS plays) on Chromium desktop, or use the microphone on any device.
  Captured audio is analyzed locally in memory and never recorded.
- **Image in** — upload up to 5 reference images, or use the built-in
  procedural rose window. With several images loaded, they cycle at a
  configurable rate (1–10s) while the music plays; every image is prebaked
  off the main thread in a Web Worker, so transitions crossfade without a
  dropped frame. Drag & drop works anywhere on the canvas.
- **Three tessellation patterns**
  - `Structure` — SLIC superpixel segmentation follows the actual regions of
    your image and cuts the glass along them.
  - `Geometric Voronoi` — organic irregular cells.
  - `Honeycomb lattice` — a hexagonal grid.
- **Audio-reactive rendering** — 5 frequency bands are mapped onto cells
  (radial, inverse radial, left→right, or scattered); energy backlights the glass additively,
  and detected beats flash the lead came.
- **Church window setting** — the panel sits in a dark nave: Gothic arch,
  rose circle, or full-bleed. Stone-dark surroundings, colored light spill,
  and a bright sky behind the glass.
- **Backlit realism** — a slowly swaying light source behind the panel:
  translucent panes with per-cell clarity (light visibly passes through),
  two-tone color pooling, streaky hand-made glass texture, seed bubbles,
  ripple striations, dimensional lead came with solder joints, and hand-cut
  curved cell edges.
- **Volumetric fog & god rays** — a configurable fog layer (haze veil,
  drifting dust motes) with light shafts that pierce through the brightest
  panes, produced by a low-res zoom-blur accumulation toward the light source.
- **Fully configurable** — cell density, grid thickness, color treatment
  (true / jewel / ember mono), reactivity, sensitivity, ambient light, beat
  pulse strength.
- **PWA** — installable, works fullscreen, service worker with network-first
  HTML and cache-first assets.

## Tech

React 19 + TypeScript + Vite + Tailwind + shadcn/ui. Canvas 2D rendering with
a precomputed static glass layer plus a per-frame additive glow pass. The
expensive scene pipeline (image placement, tessellation, static paint) runs
in a Web Worker on OffscreenCanvas with a per-image prebake cache, so image
cycling and settings changes never block the main thread (graceful sync
fallback where unavailable). Voronoi via `d3-delaunay`; segmentation is a
compact in-house SLIC.

## Develop

```bash
npm install
npm run dev      # dev server on :3000
npm run build    # production build to dist/
```
