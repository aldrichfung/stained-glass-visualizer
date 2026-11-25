# E2E suite

`pad-redesign-e2e-suite.cjs` — 16 end-to-end tests covering the single-image
gallery, pad load/save (one-click Set), toast feedback, landscape layout, and
upload rendering. (E4/E16/E17 were removed together with the arm/popup Set
machinery; E20 was removed on request.)

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
thumbnail pixels, and toast text/position.
