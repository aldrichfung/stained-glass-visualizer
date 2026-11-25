# E2E suite

`pad-redesign-e2e-suite.cjs` — 20 end-to-end tests (E1–E20) covering the single-image
gallery, pad load/save (Set mode) flow, the explainer popup, toast feedback, cancel
feedback, landscape layout, upload rendering, and the double-image workflow.

## Run

Requires Node.js, the `playwright` package (with Chromium installed), and a
production build of the app served on port 4173:

```sh
npm run build
npx vite preview --port 4173 --host ::
NODE_PATH=$(npm root -g) node e2e/pad-redesign-e2e-suite.cjs
```

The suite expects the app at `http://[::1]:4173/` (IPv6 loopback, as `vite preview
--host ::` binds). It drives a headless Chromium via Playwright, uploads generated
test images through the app's file input, and asserts on canvas pixel signatures,
thumbnail pixels, popup structure/position, and toast text.
