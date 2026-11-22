# Stained Glass Visualizer

A dynamic, configurable music visualizer that transforms any reference image
into a geometric stained-glass panel and animates it in reaction to your audio.

## Features

- **Audio in** — upload any audio file, or hit the built-in generative demo
  tone (112 BPM minor-key pulse synthesized live with Web Audio).
- **Image in** — upload a reference image, or use the built-in procedural
  rose window. Drag & drop works anywhere on the canvas.
- **Three tessellation patterns**
  - `Structure` — SLIC superpixel segmentation follows the actual regions of
    your image and cuts the glass along them.
  - `Geometric Voronoi` — organic irregular cells.
  - `Honeycomb lattice` — a hexagonal grid.
- **Audio-reactive rendering** — 5 frequency bands are mapped onto cells
  (radial, left→right, or scattered); energy backlights the glass additively,
  and detected beats flash the lead came.
- **Fully configurable** — cell density, lead thickness, color treatment
  (true / jewel / ember mono), reactivity, sensitivity, ambient light, beat
  pulse strength.
- **PWA** — installable, works fullscreen, service worker with network-first
  HTML and cache-first assets.

## Tech

React 19 + TypeScript + Vite + Tailwind + shadcn/ui. Canvas 2D rendering with
a precomputed static glass layer plus a per-frame additive glow pass.
Voronoi via `d3-delaunay`; segmentation is a compact in-house SLIC.

## Develop

```bash
npm install
npm run dev      # dev server on :3000
npm run build    # production build to dist/
```
