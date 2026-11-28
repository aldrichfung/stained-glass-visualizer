# E2E suite

`pad-redesign-e2e-suite.cjs` — 27 end-to-end tests covering the per-pad image
bindings (each pad row owns its upload/thumbnail/remove controls; there is no
central reference-image strip), always-targeted pads, the anchored one-click
Set (settings only — images live on the rows), pad status chips, window shapes,
landscape layout, upload rendering, pad prebake/cache hygiene (E24/E25),
per-pad built-in defaults (E7), timed auto-cycle (E26/E27), beat-triggered
auto-cycle (E28 beat-quantized cycling + silence hold, E29 interference,
E30 off/timed/beat mode UI), and the anchored Set geometry (E31).
(E4/E16/E17 were removed with the arm/popup Set machinery; E20 was removed on
request.)

While toasts are disabled app-side (`TOASTS_ENABLED = false` in
`src/lib/config.ts`), only E18 (whose subject is toast position in landscape)
is skipped. All other tests had their toast verifications replaced with
stored-state, thumbnail, chip, and canvas-pixel oracles — 26 run, 1 skips.

The beat-mode tests drive the built-in 128 BPM demo tone and require the
browser flag `--autoplay-policy=no-user-gesture-required` (the suite sets it)
so the AudioContext can start from synthetic clicks.

## Run

Requires Node.js, the `playwright` package (with Chromium installed), and a
production build of the app served on port 4173. Run the suite **from the repo**
so the run record lands in `e2e/results/` (see below):

```sh
npm run build
npx vite preview --port 4173 --host ::
NODE_PATH=$(npm root -g) node e2e/pad-redesign-e2e-suite.cjs
```

The suite expects the app at `http://[::1]:4173/` (IPv6 loopback, as `vite preview
--host ::` binds). It drives a headless Chromium via Playwright, uploads generated
test images through the app's file input, and asserts on canvas pixel signatures,
thumbnail pixels, stored state, and pad chip colors.

## Run records (`e2e/results/`)

Every run persists a durable record into `e2e/results/`:

- `run-<ISO timestamp>.json` — one file per run, committed to the repo so any
  run can be referenced later.
- `latest.json` — copy of the most recent run.

Each record contains the suite filename, start time, total duration, the git
commit/branch/dirty state of the checkout under test, the pass/fail/skip
summary, and the full per-test assertion details. Set `E2E_RESULTS_DIR` to
redirect the output (e.g. for scratch runs that shouldn't touch the repo).

## Defect log (`e2e/DEFECTS.md`)

Confirmed defects that the suite itself flagged (test failure → investigation →
real app defect) are logged in `DEFECTS.md` with root cause, fix commit, and
the regression test guarding them. Failures caused by flakiness, outdated
assertions after intended product changes, or environment issues are suite
maintenance and are never logged there.
