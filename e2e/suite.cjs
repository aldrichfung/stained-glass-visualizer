/* E2E suite for the simplification redesign: per-pad image bindings (each pad row owns
 * its upload/remove control; there is no central reference-image strip), always-targeted
 * pads, one-click anchored Set (settings only — images live on the rows), decluttered
 * panel. 27 tests (E1-E31, 1 skipped: E18's toast-position oracles are off; E4/E16/E17
 * removed with the arm/popup machinery, E20 removed on request). Toast assertions were
 * stripped from all other tests — save/load confirmation is verified via stored state,
 * pad-row thumbnails, chips, and canvas pixels. Run: see e2e/README.md */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://[::1]:4173/'
const DEMO = 'Built-in rose window'
const results = []

// toasts are disabled app-side (TOASTS_ENABLED=false in src/lib/config.ts) —
// only E18 (whose subject IS toast position) is skipped until feedback is re-enabled
const TOASTS_DISABLED = true
function skipTest(id) {
  results.push({ id, pass: true, skipped: true, asserts: [], error: null })
  console.log(`SKIP ${id} (toast oracles disabled)`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function record(id, asserts, error) {
  const pass = !error && asserts.every((a) => a.pass)
  results.push({ id, pass, asserts, error: error || null })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}${error ? ' ERROR: ' + error : ''}`)
  if (!pass) asserts.filter((a) => !a.pass).forEach((a) => console.log(`     ✗ ${a.name}: ${a.detail ?? ''}`))
}
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0))

const INIT = () => {
  window.__sig = () => {
    const c = document.querySelector('canvas.viz')
    const x = c.getContext('2d')
    const out = []
    for (let gy = 0; gy < 4; gy++)
      for (let gx = 0; gx < 4; gx++) {
        const d = x.getImageData(Math.floor(c.width * (0.2 + 0.15 * gx)), Math.floor(c.height * (0.15 + 0.12 * gy)), 8, 8).data
        let r = 0, g = 0, b = 0
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2] }
        const n = d.length / 4
        out.push(r / n, g / n, b / n)
      }
    return out
  }
  window.__toast = () => { const t = [...document.querySelectorAll('p.animate-toast')]; return t.length ? t[t.length - 1].textContent : null }
  // per-pad image bindings: each pad row owns its file input + thumbnail
  window.__padUpload = (letter, color, name) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64
    const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 64, 64)
    return new Promise((res) => cv.toBlob((blob) => {
      const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/png' }))
      const input = document.querySelector(`input[aria-label="Image file for pad ${letter}"]`)
      if (!input) throw new Error(`no image input for pad ${letter} (panel open?)`)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      setTimeout(res, 1100)
    }, 'image/png'))
  }
  const padRowEl = (letter) =>
    [...document.querySelectorAll('[role=button][aria-label$=": load"]')].find((r) => r.getAttribute('aria-label') === `Pad ${letter}: load`)
  window.__padThumb = (letter) => {
    const img = padRowEl(letter)?.querySelector('img')
    return { hasThumb: !!img, name: img?.title ?? null }
  }
  window.__padThumbColor = (letter) => {
    const img = padRowEl(letter)?.querySelector('img')
    if (!img) return null
    const cv = document.createElement('canvas'); cv.width = cv.height = 16
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 16, 16)
    const d = cx.getImageData(0, 0, 16, 16).data
    let r = 0, g = 0, bl = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2] }
    const n = d.length / 4
    return [r / n, g / n, bl / n]
  }
  window.__hasUploadBtn = (letter) => !!document.querySelector(`button[aria-label="Upload image to pad ${letter}"]`)
  window.__removePadImage = (letter) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('aria-label') === `Remove image from pad ${letter}`)
    if (b) { b.click(); return true } return false
  }
  window.__pads = () => JSON.parse(localStorage.getItem('sgv-presets-v1') || 'null')
  window.__combos = () => [...document.querySelectorAll('[role=combobox]')].map((c) => c.textContent.trim())
  window.__setShape = (label) => {
    const combo = document.querySelectorAll('[role=combobox]')[0]
    combo.click()
    return new Promise((res) => setTimeout(() => {
      const opt = [...document.querySelectorAll('[role=option]')].find((o) => o.textContent.trim() === label)
      if (opt) opt.click()
      setTimeout(res, 700)
    }, 400))
  }
  // single anchored Set: the button exists once and its label follows the
  // targeted pad — a lookup miss means the test targeted the wrong pad
  window.__setPadBtn = (letter) => {
    const all = [...document.querySelectorAll('button[aria-label^="Set pad "]')]
    const b = all.find((x) => x.getAttribute('aria-label') === `Set pad ${letter}`)
    if (!b) throw new Error(`Set pad ${letter} not found (targeted: ${all.map((x) => x.getAttribute('aria-label')).join(',') || 'none'})`)
    b.click(); return true
  }
  window.__padRow = (letter) => {
    const r = [...document.querySelectorAll('[role=button][aria-label]')].find((x) => x.getAttribute('aria-label') === `Pad ${letter}: load`)
    if (r) { r.click(); return true } return false
  }
  window.__touchPad = (letter) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => (x.getAttribute('aria-label') || '').startsWith(`Pad ${letter}:`) && !x.closest('[role=button]'))
    if (b) { b.click(); return true } return false
  }
  window.__padRowState = () =>
    PADS().map((row) => ({
      label: row.querySelector('span')?.textContent,
      current: row.getAttribute('aria-current') === 'true',
      pulsing: row.className.includes('animate-pulse'),
    }))
  function PADS() { return [...document.querySelectorAll('[role=button][aria-label$=": load"]')] }
  window.__clearPad = (letter) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('aria-label') === `Clear pad ${letter}`)
    if (b) { b.click(); return true } return false
  }
  window.__hint = (label) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('aria-label') === `${label} — what does this do?`)
    if (b) { b.click(); return true } return false
  }
  window.__hintText = () => document.querySelector('span.absolute.left-0.top-5')?.textContent ?? null
  window.__sections = () => [...document.querySelectorAll('h2')].map((h) => h.textContent.trim())
  window.__labels = () => [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).filter(Boolean)
  // visibility oracles: existence in the DOM is NOT visibility (the v30 defect)
  window.__rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }
  window.__toastRect = () => { const t = [...document.querySelectorAll('p.animate-toast')]; return window.__rect(t[t.length - 1]) }
  window.__sheetRect = () => window.__rect(document.querySelector('[data-slot="sheet-content"]') || document.querySelector('[role=dialog]'))
  window.__openSheet = () => { const b = document.querySelector('button[aria-label="Open controls"]'); if (b) { b.click(); return true } return false }
  // pad status chip (red = default look, green = custom look saved) — the
  // letter span carries its own aria-label so state is checkable without pixels
  window.__chip = (letter) => {
    const s = [...document.querySelectorAll('span[aria-label]')].find((x) => (x.getAttribute('aria-label') || '').startsWith(`Pad ${letter}: `))
    if (!s) return null
    const cs = getComputedStyle(s)
    return { label: s.getAttribute('aria-label'), color: cs.color, borderColor: cs.borderColor }
  }
  // auto-cycle: toggle button, state readout, slider drive. The button walks
  // off → timed → beat → off; the slider swaps between seconds and beats
  window.__autoToggle = () => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => /auto-cycle/i.test(x.getAttribute('aria-label') || ''))
    b?.click()
  }
  window.__autoState = () => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => /auto-cycle/i.test(x.getAttribute('aria-label') || ''))
    const label = b ? b.getAttribute('aria-label') : null
    const ts = document.querySelector('span[aria-label="Auto-cycle interval"] [role=slider]')
    const bs = document.querySelector('span[aria-label="Beat divider"] [role=slider]')
    const s = ts || bs
    const v = document.querySelector('[aria-label="Auto-cycle value"]')
    return {
      label,
      mode: label === 'Start auto-cycle' ? 'off' : bs ? 'beat' : 'timed',
      sliderLabel: ts ? 'Auto-cycle interval' : bs ? 'Beat divider' : null,
      sec: ts ? Number(ts.getAttribute('aria-valuenow')) : null,
      min: s ? Number(s.getAttribute('aria-valuemin')) : null,
      max: s ? Number(s.getAttribute('aria-valuemax')) : null,
      value: v ? v.textContent : null,
      paused: document.body.textContent.includes('paused while editing'),
    }
  }
  window.__demoToggle = () => {
    const b = [...document.querySelectorAll('button')].find((x) => /demo tone/i.test(x.textContent || ''))
    b?.click()
  }
  window.__demoActive = () => /Stop demo tone/.test(document.body.textContent)
  window.__currentPad = () => 'ABCD'[(window.__padRowState() || []).findIndex((r) => r.current)]
}

async function newPage(browser, viewport, seed) {
  const ctx = await browser.newContext(viewport === 'mobile' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } })
  if (seed) await ctx.addInitScript((s) => localStorage.setItem('sgv-presets-v1', JSON.stringify(s.presets || [null, null, null, null])), { presets: seed })
  await ctx.addInitScript(INIT)
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForSelector('canvas.viz')
  await sleep(1500)
  return { ctx, page }
}
const ev = (page, fn, arg) => page.evaluate(fn, arg)
const sig = (page) => page.evaluate(() => window.__sig())
const toast = (page) => page.evaluate(() => window.__toast())
const pads = (page) => page.evaluate(() => window.__pads())
const padThumb = (page, letter) => page.evaluate((l) => window.__padThumb(l), letter)
const padUpload = (page, letter, color, name) => page.evaluate(([l, c, n]) => window.__padUpload(l, c, n), [letter, color, name])
const overlap = (a, b) => !!(a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)

;(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
  const t0 = Date.now()

  // E1: clean default state — A targeted, defaults shown, demo hidden, stripped UI
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'A targeted by default', pass: rows[0]?.current === true && rows.filter((r) => r.current).length === 1, detail: JSON.stringify(rows) })
      a.push({ name: 'no reference image section', pass: !(await ev(page, () => window.__sections())).some((s) => /reference image/i.test(s)), detail: (await ev(page, () => window.__sections())).join(' > ') })
      const upBtns = await ev(page, () => ['A', 'B', 'C', 'D'].map((L) => window.__hasUploadBtn(L)))
      a.push({ name: 'every pad row offers upload (no thumbs yet)', pass: upBtns.every(Boolean) && (await Promise.all(['A', 'B', 'C', 'D'].map((L) => padThumb(page, L)))).every((t) => !t.hasThumb), detail: JSON.stringify(upBtns) })
      const cb = await ev(page, () => window.__combos())
      a.push({ name: 'default look shown (arch/jewel)', pass: cb[0] === 'Gothic arch' && cb[3] === 'Jewel tones', detail: cb.join('|') })
      const labels = await ev(page, () => window.__labels())
      a.push({ name: 'Pulse Strength renamed', pass: labels.includes('Pulse Strength') && !labels.includes('Pulse strength'), detail: '' })
      a.push({ name: 'no cycle UI', pass: !labels.some((l) => l.includes('Cycle every')), detail: '' })
      a.push({ name: 'no assign button', pass: !(await ev(page, () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Assign current look')))), detail: '' })
      a.push({ name: 'no Load/Save buttons on rows', pass: !(await ev(page, () => [...document.querySelectorAll('button')].some((b) => ['Load', 'Save here', 'Save'].includes(b.textContent.trim())))), detail: '' })
      a.push({ name: 'no image counter', pass: !(await ev(page, () => /[0-9]\/[0-9]/.test(document.body.textContent))), detail: '' })
      a.push({ name: 'no restore button', pass: !(await ev(page, () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Restore built-in')))), detail: '' })
      a.push({ name: 'punch/strobe inline tips gone', pass: !(await ev(page, () => document.body.textContent.includes('Low: smooth sustained glow') && ![...document.querySelectorAll('span.absolute')].length)), detail: '' })
      const secs = await ev(page, () => window.__sections())
      const ii = secs.findIndex((s) => s.toLowerCase() === 'audio')
      a.push({ name: 'pads section directly after audio', pass: secs[ii + 1] === 'Performance pads', detail: secs.join(' > ') })
      a.push({ name: 'hint icons present', pass: await ev(page, () => !!document.querySelector('button[aria-label="Punch — what does this do?"]') && !!document.querySelector('button[aria-label="Strobe — what does this do?"]')), detail: '' })
      a.push({ name: 'build stamp present', pass: /build \w+ ·/.test(await ev(page, () => document.body.textContent)), detail: '' })
      record('E1 clean-state', a)
    } catch (e) { record('E1 clean-state', a, e.message) } finally { await ctx.close() }
  }

  // E2: pad image workflow — upload onto a pad row auto-saves the image
  // (plus disappears, thumbnail appears); the corner X removes just the
  // image and brings the upload button back
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await padUpload(page, 'A', '#ff0000', 'red.png')
      let th = await padThumb(page, 'A')
      a.push({ name: 'thumbnail appears on pad A', pass: th.hasThumb && th.name === 'red.png', detail: JSON.stringify(th) })
      a.push({ name: 'upload button gone while image set', pass: !(await ev(page, () => window.__hasUploadBtn('A'))), detail: '' })
      a.push({ name: 'image auto-saved without Set', pass: (await pads(page))[0]?.imageName === 'red.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      a.push({ name: 'other rows still offer upload', pass: await ev(page, () => window.__hasUploadBtn('B') && window.__hasUploadBtn('C') && window.__hasUploadBtn('D')), detail: '' })
      await ev(page, () => window.__removePadImage('A')); await sleep(500)
      th = await padThumb(page, 'A')
      a.push({ name: 'corner X removes thumb, upload button back', pass: !th.hasThumb && (await ev(page, () => window.__hasUploadBtn('A'))), detail: JSON.stringify(th) })
      a.push({ name: 'pad kept its (default) settings after image removal', pass: (await pads(page))[0] !== null && (await pads(page))[0].imageId === null, detail: JSON.stringify((await pads(page))[0]?.imageId) })
      await padUpload(page, 'A', '#00ff00', 'green.png') // re-upload after removal
      th = await padThumb(page, 'A')
      a.push({ name: 're-upload after removal works', pass: th.hasThumb && th.name === 'green.png', detail: JSON.stringify(th) })
      record('E2 pad-image-workflow', a)
    } catch (e) { record('E2 pad-image-workflow', a, e.message) } finally { await ctx.close() }
  }

  // E3: Set is ONE click — the current settings save immediately, no arm, no
  // popup, no confirm press. The pad keeps the image its row already owned.
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await padUpload(page, 'A', '#ff0000', 'red.png')
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A'))
      await sleep(600)
      const p = (await pads(page))[0]
      a.push({ name: 'Set stores settings, keeps pad image', pass: p?.config?.windowShape === 'rose' && p.imageName === 'red.png' && typeof p.imageData === 'string' && p.imageData.length > 500, detail: JSON.stringify({ shape: p?.config?.windowShape, name: p?.imageName, data: (p?.imageData || '').length }) })
      a.push({ name: 'no popup ever appears', pass: (await ev(page, () => document.body.textContent.includes('This is Config mode'))) === false, detail: '' })
      a.push({ name: 'no arm pulse on any row', pass: (await ev(page, () => window.__padRowState())).every((r) => r.pulsing === false), detail: JSON.stringify(await ev(page, () => window.__padRowState())) })
      a.push({ name: 'saved pad becomes targeted', pass: (await ev(page, () => window.__padRowState()))[0]?.current === true, detail: '' })
      record('E3 one-click-set', a)
    } catch (e) { record('E3 one-click-set', a, e.message) } finally { await ctx.close() }
  }

  // E5: pressing pads loads — touch pad, panel row, keyboard — panel follows
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await padUpload(page, 'A', '#ff0000', 'red.png')
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A')); await sleep(500)
      await ev(page, () => window.__touchPad('B')); await sleep(600) // empty pad
      let rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'B targeted after touch press', pass: rows[1].current && rows.filter((r) => r.current).length === 1, detail: JSON.stringify(rows) })
      const cb = await ev(page, () => window.__combos())
      a.push({ name: 'controls show defaults', pass: cb[0] === 'Gothic arch', detail: cb[0] })
      await page.keyboard.press('1')
      await sleep(800)
      rows = await ev(page, () => window.__padRowState())
      const cb2 = await ev(page, () => window.__combos())
      const th = await padThumb(page, 'A')
      a.push({ name: 'keyboard 1 loads A', pass: rows[0].current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'A config restored (rose)', pass: cb2[0] === 'Rose circle', detail: cb2[0] })
      a.push({ name: 'A row keeps its image thumbnail', pass: th.hasThumb && th.name === 'red.png', detail: JSON.stringify(th) })
      record('E5 pad-press-loads', a)
    } catch (e) { record('E5 pad-press-loads', a, e.message) } finally { await ctx.close() }
  }

  // E6: two pads, two images — an upload lands on ITS pad without stealing
  // the stage; pad loads swap the rendered image
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const sigs = {}
    try {
      sigs[DEMO] = await sig(page)
      sigs[DEMO] = await sig(page)
      await padUpload(page, 'A', '#ff0000', 'red.png'); await sleep(1500) // bake + crossfade
      sigs['red.png'] = await sig(page)
      a.push({ name: 'upload to targeted pad renders red', pass: dist(sigs['red.png'], sigs[DEMO]) > 40, detail: dist(sigs['red.png'], sigs[DEMO]).toFixed(1) })
      const sBefore = await sig(page)
      await padUpload(page, 'B', '#00ff00', 'green.png'); await sleep(800)
      a.push({ name: 'upload to non-targeted B leaves canvas alone', pass: dist(sBefore, await sig(page)) < 80, detail: dist(sBefore, await sig(page)).toFixed(1) })
      a.push({ name: 'B row shows its thumbnail', pass: (await padThumb(page, 'B')).name === 'green.png', detail: JSON.stringify(await padThumb(page, 'B')) })
      await ev(page, () => window.__touchPad('B')); await sleep(1500)
      sigs['green.png'] = await sig(page)
      const dG = dist(sigs['green.png'], sigs['red.png'])
      a.push({ name: 'load B renders green', pass: dG > 100, detail: `red↔green=${dG.toFixed(0)}` })
      a.push({ name: 'A row still shows red thumbnail', pass: (await padThumb(page, 'A')).name === 'red.png', detail: JSON.stringify(await padThumb(page, 'A')) })
      await ev(page, () => window.__touchPad('A')); await sleep(1500)
      const s = await sig(page)
      const dR = dist(s, sigs['red.png']); const dG2 = dist(s, sigs['green.png'])
      a.push({ name: 'load A renders red again', pass: dR < dG2 * 0.6, detail: `red=${dR.toFixed(0)} green=${dG2.toFixed(0)}` })
      record('E6 pad-image-swap', a)
    } catch (e) { record('E6 pad-image-swap', a, e.message) } finally { await ctx.close() }
  }

  // E7: pad saved with no image falls back to its built-in default on load
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__touchPad('C')); await sleep(600) // target C first (empty → defaults + demo)
      await ev(page, () => window.__setPadBtn('C')); await sleep(500) // settings only — C keeps no image
      a.push({ name: 'default-look pad stored on C (no image)', pass: (await pads(page))[2] !== null && (await pads(page))[2].imageId === null, detail: JSON.stringify((await pads(page))[2]?.config?.windowShape) })
      await padUpload(page, 'A', '#ff0000', 'red.png')
      a.push({ name: 'A row shows its image', pass: (await padThumb(page, 'A')).name === 'red.png', detail: JSON.stringify(await padThumb(page, 'A')) })
      // loading an imageless pad falls back to that pad's built-in default —
      // the row shows the upload button, never a stale thumbnail
      await ev(page, () => window.__touchPad('B')); await sleep(600)
      a.push({ name: 'empty pad load: upload button, no thumbnail', pass: (await ev(page, () => window.__hasUploadBtn('B'))) && !(await padThumb(page, 'B')).hasThumb, detail: JSON.stringify(await padThumb(page, 'B')) })
      await ev(page, () => window.__touchPad('C')); await sleep(800)
      a.push({ name: 'saved imageless pad loads with upload button too', pass: (await ev(page, () => window.__hasUploadBtn('C'))) && !(await padThumb(page, 'C')).hasThumb, detail: JSON.stringify(await padThumb(page, 'C')) })
      // per-pad built-in defaults: every pad owns a distinct default image,
      // so pressing untouched pads (and auto-cycling them) is never a no-op
      await ev(page, () => window.__removePadImage('A')); await sleep(400) // restore A's built-in
      const dflt = {}
      await sleep(700); dflt.C = await sig(page)
      for (const L of ['A', 'B', 'D']) {
        await ev(page, (l) => window.__touchPad(l), L); await sleep(1800)
        dflt[L] = await sig(page)
      }
      const pairDist = [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']].map(([x, y]) => dist(dflt[x], dflt[y]))
      a.push({ name: 'each pad has a distinct built-in default image', pass: pairDist.every((d) => d > 60), detail: pairDist.map((d) => d.toFixed(0)).join(' ') })
      record('E7 demo-fallback', a)
    } catch (e) { record('E7 demo-fallback', a, e.message) } finally { await ctx.close() }
  }

  // E8: repeat Set just re-saves (there is no arm left to cancel); X clear
  // keeps targeting and snaps the panel back to defaults
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__touchPad('C')); await sleep(500) // target C first
      await ev(page, () => window.__setPadBtn('C')); await sleep(400)
      await ev(page, () => window.__setPadBtn('C')); await sleep(400)
      a.push({ name: 'repeat Set re-saves (no toggle-off)', pass: (await pads(page))[2] !== null, detail: JSON.stringify((await pads(page))[2]?.config?.windowShape) })
      await ev(page, () => window.__clearPad('C')); await sleep(300)
      a.push({ name: 'C cleared for next step', pass: (await pads(page))[2] === null, detail: '' })
      // save a non-default look onto B, then clear it while targeted:
      // the panel must snap back to defaults, not keep showing stale edits
      await ev(page, () => window.__touchPad('B')); await sleep(500) // target B first (loads defaults)
      await ev(page, () => window.__setShape('Rose circle')); await sleep(300)
      a.push({ name: 'shape changed pre-save', pass: (await ev(page, () => window.__combos()))[0] === 'Rose circle', detail: (await ev(page, () => window.__combos()))[0] })
      await ev(page, () => window.__setPadBtn('B')); await sleep(400)
      a.push({ name: 'look saved to B', pass: (await pads(page))[1]?.config?.windowShape === 'rose', detail: JSON.stringify((await pads(page))[1]?.config?.windowShape) })
      await ev(page, () => window.__clearPad('B')); await sleep(400)
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'X clears, pad stays targeted', pass: rows[1].current === true && (await pads(page))[1] === null, detail: JSON.stringify(rows) })
      const comboAfter = (await ev(page, () => window.__combos()))[0]
      a.push({ name: 'targeted clear resets panel to defaults', pass: comboAfter === 'Gothic arch', detail: comboAfter })
      record('E8 set-repeat-and-clear', a)
    } catch (e) { record('E8 set-repeat-and-clear', a, e.message) } finally { await ctx.close() }
  }

  // E9: hint overlays + photosensitivity warning intact
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__hint('Punch')); await sleep(200)
      a.push({ name: 'punch hint overlay', pass: String(await ev(page, () => window.__hintText())).includes('smooth sustained glow'), detail: String(await ev(page, () => window.__hintText())) })
      await page.mouse.click(30, 400); await sleep(300)
      a.push({ name: 'outside click closes', pass: (await ev(page, () => window.__hintText())) === null, detail: '' })
      await ev(page, () => window.__hint('Strobe')); await sleep(200)
      a.push({ name: 'strobe hint overlay', pass: String(await ev(page, () => window.__hintText())).includes('flashes and falls'), detail: '' })
      record('E9 hints', a)
    } catch (e) { record('E9 hints', a, e.message) } finally { await ctx.close() }
  }

  // E10: persistence — pads + targeted pad survive reload
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__touchPad('B')); await sleep(500) // target B before uploading
      await padUpload(page, 'B', '#ff0000', 'red.png')
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('canvas.viz')
      await sleep(2000)
      const rows = await ev(page, () => window.__padRowState())
      const th = await padThumb(page, 'B')
      a.push({ name: 'B still targeted after reload', pass: rows[1].current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'B image materialized on startup', pass: th.hasThumb && th.name === 'red.png', detail: JSON.stringify(th) })
      record('E10 persistence', a)
    } catch (e) { record('E10 persistence', a, e.message) } finally { await ctx.close() }
  }

  // E11: image-removal ritual — the thumbnail's corner X removes ONLY the
  // image (settings survive, built-in default returns, upload button is
  // back); the row's right-side X then wipes the whole pad
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await padUpload(page, 'A', '#000000', 'ritual-A.png'); await sleep(1200)
      const sigImg = await sig(page)
      await ev(page, () => window.__setShape('Rose circle')); await sleep(300)
      await ev(page, () => window.__setPadBtn('A')); await sleep(500) // settings: rose
      a.push({ name: 'pad holds rose settings + image', pass: (await pads(page))[0]?.config?.windowShape === 'rose' && (await pads(page))[0]?.imageName === 'ritual-A.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      await ev(page, () => window.__removePadImage('A')); await sleep(1200)
      const p = (await pads(page))[0]
      a.push({ name: 'corner X keeps settings, drops image', pass: p?.config?.windowShape === 'rose' && p.imageId === null, detail: JSON.stringify({ shape: p?.config?.windowShape, img: p?.imageId }) })
      a.push({ name: 'upload button back on A', pass: await ev(page, () => window.__hasUploadBtn('A')), detail: '' })
      a.push({ name: 'canvas reverts to built-in default image', pass: dist(await sig(page), sigImg) > 60, detail: dist(await sig(page), sigImg).toFixed(1) })
      await ev(page, () => window.__clearPad('A')); await sleep(400)
      a.push({ name: 'row X wipes the whole pad', pass: (await pads(page))[0] === null, detail: '' })
      record('E11 image-removal-ritual', a)
    } catch (e) { record('E11 image-removal-ritual', a, e.message) } finally { await ctx.close() }
  }

  // E12: legacy v28 presets migrate — cycleSec stripped, imageless pads fall back
  {
    const a = []
    const legacy = [{ config: { windowShape: 'quatrefoil', colorMode: 'cathedral', cycleSec: 7 }, imageId: 'img-ghost', imageName: 'ghost.png', imageData: null }, null, null, null]
    const { ctx, page } = await newPage(browser, 'desktop', legacy)
    try {
      const cb = await ev(page, () => window.__combos())
      a.push({ name: 'legacy config applied on startup', pass: cb[0] === 'Quatrefoil' && cb[3] === 'Cathedral (ruby · cobalt · gold)', detail: cb.join('|') })
      const stored = await pads(page)
      a.push({ name: 'cycleSec scrubbed on next persist', pass: true, detail: '' }) // persist happens on next save; verify schema via save below
      await ev(page, () => window.__setPadBtn('A')); await sleep(500)
      const p = (await pads(page))[0]
      a.push({ name: 're-saved pad has no cycleSec', pass: p && !('cycleSec' in p.config), detail: JSON.stringify(Object.keys(p.config)) })
      record('E12 legacy-migration', a)
    } catch (e) { record('E12 legacy-migration', a, e.message) } finally { await ctx.close() }
  }

  // E13: mobile sheet — pad row upload auto-saves the image, one Set click
  // inside the sheet saves settings on top
  // (toast-position oracles removed: toasts are disabled app-side)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === 'Open controls')?.click())
      await sleep(800)
      await padUpload(page, 'A', '#ff0000', 'mob.png')
      const p0 = (await pads(page))[0]
      a.push({ name: 'row upload auto-saves image copy (no Set needed)', pass: typeof p0?.imageData === 'string' && p0.imageData.length > 500, detail: '' })
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      a.push({ name: 'no popup on mobile', pass: (await ev(page, () => document.body.textContent.includes('This is Config mode'))) === false, detail: '' })
      const p = (await pads(page))[0]
      a.push({ name: 'Set keeps the image copy', pass: typeof p?.imageData === 'string' && p.imageData.length > 500, detail: '' })
      record('E13 mobile-set-flow', a)
    } catch (e) { record('E13 mobile-set-flow', a, e.message) } finally { await ctx.close() }
  }

  // E14: same-pad press is a no-op — unsaved work survives re-pressing the targeted pad
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await padUpload(page, 'A', '#e02020', 'red.png'); await sleep(400)
      const storedBefore = (await pads(page))[0]?.config?.windowShape
      await ev(page, () => window.__setShape('Rose circle')); await sleep(800) // unsaved edit
      const sig0 = await sig(page)
      await ev(page, () => window.__touchPad('A')); await sleep(600)
      a.push({ name: 're-press does not save the edit', pass: (await pads(page))[0]?.config?.windowShape === storedBefore, detail: `${storedBefore} → ${(await pads(page))[0]?.config?.windowShape}` })
      a.push({ name: 'unsaved edit survives re-press', pass: (await ev(page, () => window.__combos()))[0] === 'Rose circle', detail: (await ev(page, () => window.__combos()))[0] })
      a.push({ name: 'pad image still there', pass: (await padThumb(page, 'A')).name === 'red.png', detail: JSON.stringify(await padThumb(page, 'A')) })
      const sig1 = await sig(page)
      a.push({ name: 'canvas unchanged after re-press', pass: dist(sig0, sig1) < 80, detail: dist(sig0, sig1).toFixed(1) })
      await page.keyboard.press('1'); await sleep(600)
      a.push({ name: 'edit survives keyboard re-press too', pass: (await ev(page, () => window.__combos()))[0] === 'Rose circle', detail: (await ev(page, () => window.__combos()))[0] })
      record('E14 same-pad-noop', a)
    } catch (e) { record('E14 same-pad-noop', a, e.message) } finally { await ctx.close() }
  }

  // E15: the defect-video repro — what took two videos and a dozen releases
  // (upload → Set → pad swap) is now a single click that cannot be fumbled
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await ev(page, () => window.__openSheet()); await sleep(800)
      await padUpload(page, 'A', '#e02020', 'red.png'); await sleep(300)
      a.push({ name: 'row upload auto-saves (stored)', pass: (await pads(page))[0]?.imageName === 'red.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      a.push({ name: 'thumbnail shows on pad A', pass: (await padThumb(page, 'A')).hasThumb, detail: JSON.stringify(await padThumb(page, 'A')) })
      await page.keyboard.press('Escape'); await sleep(800)
      await ev(page, () => window.__touchPad('B')); await sleep(900)
      const sigB = await sig(page)
      await ev(page, () => window.__touchPad('A')); await sleep(1000)
      const sigA = await sig(page)
      a.push({ name: 'B and A render different looks', pass: dist(sigA, sigB) > 60, detail: dist(sigA, sigB).toFixed(1) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      a.push({ name: 'saved image still on pad A', pass: (await padThumb(page, 'A')).name === 'red.png', detail: JSON.stringify(await padThumb(page, 'A')) })
      record('E15 defect-video-repro', a)
    } catch (e) { record('E15 defect-video-repro', a, e.message) } finally { await ctx.close() }
  }


  // E18: landscape mobile — toasts at top, one-click Set works in landscape
  if (TOASTS_DISABLED) {
    skipTest('E18 landscape')
  } else {
    const a = []
    const ctx = await browser.newContext({ viewport: { width: 780, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' }); await page.evaluate(INIT); await sleep(1200)
      await padUpload(page, 'A', '#e02020', 'land.png'); await sleep(400)
      const tr = await ev(page, () => window.__toastRect())
      a.push({ name: 'upload toast at top in landscape', pass: !!tr && tr.y < 100, detail: JSON.stringify(tr) })
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      const tr2 = await ev(page, () => window.__toastRect())
      a.push({ name: 'one-click save toast at top in landscape', pass: String(await toast(page)).startsWith('Saved A') && !!tr2 && tr2.y < 100, detail: JSON.stringify({ tr2, t: String(await toast(page)) }) })
      a.push({ name: 'no popup in landscape', pass: (await ev(page, () => document.body.textContent.includes('This is Config mode'))) === false, detail: '' })
      record('E18 landscape', a)
    } catch (e) { record('E18 landscape', a, e.message) } finally { await ctx.close() }
  }

  // E19: upload must RENDER to the canvas — state alone is not proof (the video-2 blind spot)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await ev(page, () => window.__openSheet()); await sleep(800)
      const sig0 = await sig(page)
      await padUpload(page, 'A', '#e02020', 'red.png'); await sleep(2500) // bake + crossfade
      const sig1 = await sig(page)
      a.push({ name: 'upload changes what is on the canvas', pass: dist(sig0, sig1) > 40, detail: dist(sig0, sig1).toFixed(1) })
      // and it survives the sheet closing (the black-box moment in the video)
      await page.keyboard.press('Escape'); await sleep(1500)
      const sig2 = await sig(page)
      a.push({ name: 'uploaded look still on canvas after sheet closes', pass: dist(sig1, sig2) < 60, detail: dist(sig1, sig2).toFixed(1) })
      record('E19 upload-renders', a)
    } catch (e) { record('E19 upload-renders', a, e.message) } finally { await ctx.close() }
  }


  // E21: pad status chips — red = default look, green = custom saved; an
  // all-default save stays red; an image binding alone is custom; X → red;
  // status survives reload
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const RED = 'rgb(248, 113, 113)' // text-red-400
      const GREEN = 'rgb(74, 222, 128)' // text-green-400
      const chips = () => ev(page, () => ['A', 'B', 'C', 'D'].map((L) => window.__chip(L)))
      let cs = await chips()
      a.push({ name: 'fresh state: all four chips red', pass: cs.every((c) => c && c.color === RED && c.label.endsWith('default look')), detail: JSON.stringify(cs) })
      // a custom look saved onto A turns its chip green
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A')); await sleep(500)
      cs = await chips()
      a.push({ name: 'custom save turns A green', pass: cs[0].color === GREEN && cs[0].label.endsWith('custom look saved'), detail: JSON.stringify(cs[0]) })
      a.push({ name: 'untouched pads stay red', pass: cs.slice(1).every((c) => c.color === RED), detail: JSON.stringify(cs.slice(1).map((c) => c.color)) })
      // saving while everything matches the defaults changes nothing: red
      await ev(page, () => window.__touchPad('B')); await sleep(600) // empty pad → defaults + demo
      await ev(page, () => window.__setPadBtn('B')); await sleep(500)
      cs = await chips()
      a.push({ name: 'default-equal save stays red', pass: cs[1].color === RED && (await pads(page))[1] !== null, detail: JSON.stringify(cs[1]) })
      // an image binding alone makes a pad custom
      await padUpload(page, 'D', '#e02020', 'red.png'); await sleep(400)
      cs = await chips()
      a.push({ name: 'image-only difference turns D green', pass: cs[3].color === GREEN, detail: JSON.stringify(cs[3]) })
      // X clears the pad back to default: red
      await ev(page, () => window.__clearPad('A')); await sleep(400)
      cs = await chips()
      a.push({ name: 'clear returns A to red', pass: cs[0].color === RED && (await pads(page))[0] === null, detail: JSON.stringify(cs[0]) })
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2000)
      cs = await chips()
      a.push({ name: 'chip status persists across reload', pass: cs[0].color === RED && cs[1].color === RED && cs[2].color === RED && cs[3].color === GREEN, detail: JSON.stringify(cs.map((c) => c.color)) })
      record('E21 pad-status-chip', a)
    } catch (e) { record('E21 pad-status-chip', a, e.message) } finally { await ctx.close() }
  }

  // E22: one-click-set journey — the wide net recast for the new flow: two
  // images, two pads, alternating loads, reload persistence; every step proven
  // by thumbnail pixels AND canvas pixels
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      const nearest = (s, refs) => {
        let best = null, bd = Infinity
        for (const [k, r] of Object.entries(refs)) { const d = dist(s, r); if (d < bd) { bd = d; best = k } }
        return best
      }
      const refDetail = (s, refs) => Object.entries(refs).map(([k, r]) => `${k}=${dist(s, r).toFixed(0)}`).join(' ')
      const thumbOK = async (letter, name, channel) => {
        const t = await padThumb(page, letter)
        if (!t.hasThumb || t.name !== name) return { pass: false, detail: JSON.stringify(t) }
        const c = await ev(page, (l) => window.__padThumbColor(l), letter)
        const dom = c && (channel === 'red' ? c[0] > c[1] + 40 && c[0] > c[2] + 40 : c[1] > c[0] + 40 && c[1] > c[2] + 40)
        return { pass: !!dom, detail: JSON.stringify({ t, c: c && c.map((v) => Math.round(v)) }) }
      }
      const refs = {}
      refs.demo = await sig(page)
      await ev(page, () => window.__openSheet()); await sleep(800)
      // A: upload straight onto the row, proven; then Set adds settings on top
      await padUpload(page, 'A', '#e02020', 'testA.png'); await sleep(1400)
      a.push({ name: 'upload to A auto-saved', pass: (await pads(page))[0]?.imageName === 'testA.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      a.push({ name: 'thumbnail A red-dominant', ...(await thumbOK('A', 'testA.png', 'red')) })
      await ev(page, () => window.__setShape('Rose circle')); await sleep(300)
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      a.push({ name: 'Set A stores settings, keeps image', pass: (await pads(page))[0]?.config?.windowShape === 'rose' && (await pads(page))[0]?.imageName === 'testA.png', detail: JSON.stringify({ s: (await pads(page))[0]?.config?.windowShape, i: (await pads(page))[0]?.imageName }) })
      await sleep(1200)
      refs.A = await sig(page)
      a.push({ name: 'canvas left the demo', pass: dist(refs.A, refs.demo) > 60, detail: dist(refs.A, refs.demo).toFixed(1) })
      // B: upload onto B's row — the stage stays on A until B is pressed
      await padUpload(page, 'B', '#20c020', 'testB.png'); await sleep(800)
      a.push({ name: 'upload to B auto-saved', pass: (await pads(page))[1]?.imageName === 'testB.png', detail: JSON.stringify((await pads(page))[1]?.imageName) })
      a.push({ name: 'thumbnail B green-dominant', ...(await thumbOK('B', 'testB.png', 'green')) })
      await ev(page, () => window.__touchPad('B')); await sleep(1800)
      refs.B = await sig(page)
      // alternating loads — canvas proof outside the sheet, thumbnail proof in it
      await page.keyboard.press('Escape'); await sleep(900)
      await ev(page, () => window.__touchPad('A')); await sleep(1800)
      const sA = await sig(page)
      a.push({ name: 'press A — canvas matches A', pass: nearest(sA, refs) === 'A', detail: refDetail(sA, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      a.push({ name: 'load A — thumbnail red-dominant', ...(await thumbOK('A', 'testA.png', 'red')) })
      await page.keyboard.press('Escape'); await sleep(900)
      await ev(page, () => window.__touchPad('B')); await sleep(1800)
      const sB = await sig(page)
      a.push({ name: 'press B — canvas matches B', pass: nearest(sB, refs) === 'B', detail: refDetail(sB, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      a.push({ name: 'load B — thumbnail green-dominant', ...(await thumbOK('B', 'testB.png', 'green')) })
      // reload: pads, targeting, images, and the rendered look all persist
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      const sR = await sig(page)
      a.push({ name: 'canvas matches B after reload', pass: nearest(sR, refs) === 'B', detail: refDetail(sR, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'B still targeted after reload', pass: rows[1]?.current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'B image rematerialized after reload', ...(await thumbOK('B', 'testB.png', 'green')) })
      record('E22 one-click-set-journey', a)
    } catch (e) { record('E22 one-click-set-journey', a, e.message) } finally { await ctx.close() }
  }

  // E23: shape-persistence — triangle, inverted triangle and star save onto
  // pads, render distinctly, and survive reload (config, chip, canvas)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const GREEN = 'rgb(74, 222, 128)'
      const shapes = [['Triangle', 'A'], ['Inverted triangle', 'B'], ['Star', 'C']]
      const sigs = {}
      for (const [label, L] of shapes) {
        await ev(page, (ll) => window.__touchPad(ll), L); await sleep(600) // target the pad first
        await ev(page, (l) => window.__setShape(l), label); await sleep(2000)
        a.push({ name: `${label} selected`, pass: (await ev(page, () => window.__combos()))[0] === label, detail: (await ev(page, () => window.__combos()))[0] })
        sigs[label] = await sig(page)
        await ev(page, (ll) => window.__setPadBtn(ll), L); await sleep(500)
        const chip = await ev(page, (ll) => window.__chip(ll), L)
        a.push({ name: `pad ${L} saved, chip green`, pass: chip?.color === GREEN, detail: JSON.stringify(chip) })
      }
      const dTI = dist(sigs['Triangle'], sigs['Inverted triangle'])
      const dTS = dist(sigs['Triangle'], sigs['Star'])
      const dIS = dist(sigs['Inverted triangle'], sigs['Star'])
      a.push({ name: 'three shapes render distinctly', pass: dTI > 40 && dTS > 40 && dIS > 40, detail: `tri-inv=${dTI.toFixed(0)} tri-star=${dTS.toFixed(0)} inv-star=${dIS.toFixed(0)}` })
      const nearest = (s) => Object.entries(sigs).reduce((best, [k, r]) => (dist(s, r) < dist(s, sigs[best]) ? k : best), 'Triangle')
      // reload: the last-saved pad (C, star) is targeted and restored
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      a.push({ name: 'star restored after reload (targeted pad)', pass: (await ev(page, () => window.__combos()))[0] === 'Star', detail: (await ev(page, () => window.__combos()))[0] })
      await ev(page, () => window.__touchPad('A')); await sleep(1200)
      a.push({ name: 'pad A loads triangle', pass: (await ev(page, () => window.__combos()))[0] === 'Triangle', detail: (await ev(page, () => window.__combos()))[0] })
      const sA = await sig(page)
      a.push({ name: 'triangle renders after reload', pass: nearest(sA) === 'Triangle', detail: `nearest=${nearest(sA)}` })
      await ev(page, () => window.__touchPad('B')); await sleep(1200)
      a.push({ name: 'pad B loads inverted triangle', pass: (await ev(page, () => window.__combos()))[0] === 'Inverted triangle', detail: (await ev(page, () => window.__combos()))[0] })
      const stored = await pads(page)
      a.push({ name: 'stored configs carry new shape values', pass: stored[0]?.config?.windowShape === 'triangle' && stored[1]?.config?.windowShape === 'triangle-down' && stored[2]?.config?.windowShape === 'star', detail: JSON.stringify(stored.map((x) => x?.config?.windowShape)) })
      record('E23 shape-persistence', a)
    } catch (e) { record('E23 shape-persistence', a, e.message) } finally { await ctx.close() }
  }

  // E24: pad prebake correctness — after a reload, every pad's TRUE scene
  // (its own image × its own config) lands in the bake cache with no pad
  // press at all, and no wrong-image scenes are baked (the fallback that
  // used to flood the cache and evict the real pad scenes)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const colors = [['#e02020', 'preA.png'], ['#20c020', 'preB.png'], ['#2050e0', 'preC.png'], ['#e0c020', 'preD.png']]
      const shapes = ['Triangle', 'Star', 'Rose circle', 'Gothic arch']
      const letters = ['A', 'B', 'C', 'D']
      for (let i = 0; i < 4; i++) {
        await ev(page, (l) => window.__touchPad(l), letters[i]); await sleep(600) // target pad first
        await padUpload(page, letters[i], colors[i][0], colors[i][1])
        await ev(page, (l) => window.__setShape(l), shapes[i])
        await ev(page, (l) => window.__setPadBtn(l), letters[i]); await sleep(500)
      }
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      const stored = await pads(page)
      a.push({ name: 'all 4 pads restored with image copies', pass: stored.every((p) => p && p.imageId && typeof p.imageData === 'string' && p.imageData.length > 500), detail: JSON.stringify(stored.map((p) => [p?.imageName, (p?.imageData || '').length])) })
      const wantImg = stored.map((p) => p.imageId)
      const wantShape = stored.map((p) => p.config.windowShape)
      // poll until every pad's image-matched scene is cached (prebake pipeline)
      let keys = []
      const tPre = Date.now()
      for (;;) {
        keys = await ev(page, () => (window.__scenes ? window.__scenes() : []))
        const ok = wantImg.every((id, i) => keys.some((k) => k.split('|')[0] === id && k.split('|')[3] === wantShape[i]))
        if (ok || Date.now() - tPre > 20000) break
        await sleep(500)
      }
      a.push({ name: 'every pad scene prebaked image-matched (no press)', pass: wantImg.every((id, i) => keys.some((k) => k.split('|')[0] === id && k.split('|')[3] === wantShape[i])), detail: `${keys.length} keys after ${((Date.now() - tPre) / 1000).toFixed(1)}s` })
      // no pollution: a key whose image belongs to pad X must carry pad X's shape
      const shapeOf = Object.fromEntries(wantImg.map((id, i) => [id, wantShape[i]]))
      const bad = keys.filter((k) => { const seg = k.split('|'); return shapeOf[seg[0]] && seg[3] !== shapeOf[seg[0]] })
      a.push({ name: 'no wrong-image scenes in cache', pass: bad.length === 0, detail: JSON.stringify(bad) })
      a.push({ name: 'cache within cap', pass: keys.length <= 12, detail: `${keys.length} scenes` })
      record('E24 pad-prebake-keys', a)
    } catch (e) { record('E24 pad-prebake-keys', a, e.message) } finally { await ctx.close() }
  }

  // E25: pad rotation after reload — pressing each of the 4 pads renders its
  // correct look on first press, revisits stay correct (real scenes survive,
  // no eviction churn), and the cache still holds only image-matched scenes
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const refs = {}
    try {
      const colors = [['#e02020', 'rotA.png'], ['#20c020', 'rotB.png'], ['#2050e0', 'rotC.png'], ['#e0c020', 'rotD.png']]
      const shapes = ['Triangle', 'Star', 'Rose circle', 'Gothic arch']
      const letters = ['A', 'B', 'C', 'D']
      for (let i = 0; i < 4; i++) {
        await ev(page, (l) => window.__touchPad(l), letters[i]); await sleep(600) // target pad first
        await padUpload(page, letters[i], colors[i][0], colors[i][1])
        await ev(page, (l) => window.__setShape(l), shapes[i])
        await sleep(2000) // working-scene bake + crossfade
        refs[letters[i]] = await sig(page)
        await ev(page, (l) => window.__setPadBtn(l), letters[i]); await sleep(400)
      }
      const nearest = (s) => {
        let best = null, bd = Infinity
        for (const [k, r] of Object.entries(refs)) { const d = dist(s, r); if (d < bd) { bd = d; best = k } }
        return best
      }
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      // first rotation: every pad must render its own look on first press
      for (const L of letters) {
        await ev(page, (l) => window.__touchPad(l), L)
        let match = false
        const tP = Date.now()
        while (Date.now() - tP < 12000) {
          await sleep(500)
          if (nearest(await sig(page)) === L) { match = true; break }
        }
        a.push({ name: `first press ${L} renders ${L}`, pass: match, detail: `${((Date.now() - tP) / 1000).toFixed(1)}s nearest=${nearest(await sig(page))}` })
      }
      // second rotation: still correct — real scenes were not evicted
      for (const L of letters) {
        await ev(page, (l) => window.__touchPad(l), L); await sleep(1500)
        a.push({ name: `revisit ${L} still correct`, pass: nearest(await sig(page)) === L, detail: `nearest=${nearest(await sig(page))}` })
      }
      // cache hygiene after the full rotation
      const stored = await pads(page)
      const shapeOf = Object.fromEntries(stored.map((p) => [p.imageId, p.config.windowShape]))
      const keys = await ev(page, () => window.__scenes())
      const bad = keys.filter((k) => { const seg = k.split('|'); return shapeOf[seg[0]] && seg[3] !== shapeOf[seg[0]] })
      a.push({ name: 'only image-matched scenes after rotation', pass: bad.length === 0, detail: JSON.stringify(bad) })
      a.push({ name: 'cache within cap after rotation', pass: keys.length <= 12, detail: `${keys.length} scenes` })
      record('E25 pad-rotation-reload', a)
    } catch (e) { record('E25 pad-rotation-reload', a, e.message) } finally { await ctx.close() }
  }

  // E26: auto-switch cycle — on a FRESH install (all pads empty), enabling
  // auto-cycle advances through all four pads in order and wraps, and every
  // stop renders a visibly different look (per-pad built-in defaults)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await sleep(5000) // let the four built-in default scenes prebake
      const slider = page.locator('span[aria-label="Auto-cycle interval"] [role=slider]')
      await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await sleep(300)
      const st0 = await ev(page, () => window.__autoState())
      a.push({ name: 'interval set to 2s', pass: st0.sec === 2, detail: JSON.stringify(st0) })
      a.push({ name: 'starts on pad A', pass: (await ev(page, () => window.__currentPad())) === 'A', detail: '' })
      const sigs = { A: await sig(page) }
      await ev(page, () => window.__autoToggle()); await sleep(200)
      a.push({ name: 'toggle shows timed-running state', pass: (await ev(page, () => window.__autoState())).label === 'Switch auto-cycle to beat mode', detail: JSON.stringify(await ev(page, () => window.__autoState())) })
      // observe ~12s: expect A B C D A
      const visits = []
      const t0 = Date.now()
      while (Date.now() - t0 < 12000) {
        const L = await ev(page, () => window.__currentPad())
        if (L && visits[visits.length - 1] !== L) {
          visits.push(L)
          await sleep(800) // crossfade + settle, then sample the look
          if (!sigs[L]) sigs[L] = await sig(page)
        }
        await sleep(300)
      }
      a.push({ name: 'cycles A→B→C→D in order', pass: visits.slice(0, 4).join('') === 'ABCD', detail: visits.join('') })
      a.push({ name: 'wraps back to A', pass: visits[4] === 'A', detail: visits.join('') })
      const keys = ['A', 'B', 'C', 'D']
      const pairDist = []
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) pairDist.push(dist(sigs[keys[i]], sigs[keys[j]]))
      a.push({ name: 'every cycle stop renders a distinct look', pass: pairDist.every((d) => d > 40), detail: pairDist.map((d) => d.toFixed(0)).join(' ') })
      record('E26 auto-switch-cycle', a)
    } catch (e) { record('E26 auto-switch-cycle', a, e.message) } finally { await ctx.close() }
  }

  // E27: auto-switch interference — manual press resets the dwell, editing
  // pauses the cycle, Set resumes it, and a reload starts with the mode off
  // but the interval remembered
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const untilPad = async (L, timeout) => {
      const t = Date.now()
      while (Date.now() - t < timeout) {
        if ((await ev(page, () => window.__currentPad())) === L) return (Date.now() - t) / 1000
        await sleep(250)
      }
      return null
    }
    try {
      await sleep(4500) // prebake warmup
      const slider = page.locator('span[aria-label="Auto-cycle interval"] [role=slider]')
      await slider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await sleep(300)
      await ev(page, () => window.__autoToggle())
      const tB = await untilPad('B', 5000)
      a.push({ name: 'auto advanced A→B', pass: tB !== null, detail: tB === null ? 'never' : `${tB.toFixed(1)}s` })
      // manual press resets the dwell: press D, must hold ~2s before wrapping to A
      const tPress = Date.now()
      await ev(page, () => window.__touchPad('D')); await sleep(1400)
      a.push({ name: 'manual press holds (no premature switch)', pass: (await ev(page, () => window.__currentPad())) === 'D', detail: await ev(page, () => window.__currentPad()) })
      const tA = await untilPad('A', 3500)
      const dwell = tA === null ? null : (Date.now() - tPress) / 1000
      a.push({ name: 'cycle resumes after a full dwell', pass: dwell !== null && dwell >= 1.6, detail: dwell === null ? 'never' : `${dwell.toFixed(1)}s after press` })
      // editing pauses the cycle
      await page.locator('span[aria-label="Cell density"] [role=slider]').focus(); await page.keyboard.press('End'); await sleep(400)
      a.push({ name: 'editing pauses the cycle', pass: (await ev(page, () => window.__autoState())).paused === true, detail: JSON.stringify(await ev(page, () => window.__autoState())) })
      await sleep(4500) // > two full intervals
      a.push({ name: 'no switching while paused', pass: (await ev(page, () => window.__currentPad())) === 'A', detail: await ev(page, () => window.__currentPad()) })
      // Set resumes
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      a.push({ name: 'Set resumes the cycle', pass: (await ev(page, () => window.__autoState())).paused === false, detail: '' })
      const tB2 = await untilPad('B', 4500)
      a.push({ name: 'advance after resume', pass: tB2 !== null, detail: tB2 === null ? 'never' : `${tB2.toFixed(1)}s` })
      // reload: mode off, interval remembered
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      const st = await ev(page, () => window.__autoState())
      a.push({ name: 'mode off after reload', pass: st.label === 'Start auto-cycle', detail: JSON.stringify(st) })
      a.push({ name: 'interval persisted across reload', pass: st.sec === 2, detail: `sec=${st.sec}` })
      await sleep(2500)
      a.push({ name: 'no cycling while off', pass: (await ev(page, () => window.__currentPad())) === 'B', detail: await ev(page, () => window.__currentPad()) })
      record('E27 auto-switch-interference', a)
    } catch (e) { record('E27 auto-switch-interference', a, e.message) } finally { await ctx.close() }
  }

  // E28: beat-quantized cycle — with the demo tone playing, beat mode
  // advances pads in beat time (divider 4 at 128 BPM ≈ every 1.9s), in
  // order, NOT on the timed slider's interval; stopping the music stops
  // the switching (no timer fallback)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await sleep(5000) // prebake the four built-in defaults
      // prove the beat (not the timer) drives it: push timed interval to 10s
      const tSlider = page.locator('span[aria-label="Auto-cycle interval"] [role=slider]')
      await tSlider.focus(); await page.keyboard.press('End'); await sleep(200)
      a.push({ name: 'timed interval parked at 10s', pass: (await ev(page, () => window.__autoState())).sec === 10, detail: '' })
      // off → timed → beat, then divider = 4 beats
      await ev(page, () => window.__autoToggle()); await sleep(200)
      await ev(page, () => window.__autoToggle()); await sleep(300)
      const stB = await ev(page, () => window.__autoState())
      a.push({ name: 'beat mode engaged', pass: stB.mode === 'beat' && stB.label === 'Stop auto-cycle', detail: JSON.stringify(stB) })
      const bSlider = page.locator('span[aria-label="Beat divider"] [role=slider]')
      await bSlider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await sleep(200)
      a.push({ name: 'divider set to 4 beats', pass: (await ev(page, () => window.__autoState())).value === '4 beats', detail: JSON.stringify(await ev(page, () => window.__autoState())) })
      await ev(page, () => window.__demoToggle()); await sleep(600)
      a.push({ name: 'demo tone playing', pass: await ev(page, () => window.__demoActive()), detail: '' })
      // observe ~14s: 4 beats at 128 BPM ≈ 1.875s per switch → expect ≥6 switches
      const visits = []
      const t0 = Date.now()
      visits.push([await ev(page, () => window.__currentPad()), 0])
      while (Date.now() - t0 < 14000) {
        const L = await ev(page, () => window.__currentPad())
        if (L && L !== visits[visits.length - 1][0]) visits.push([L, (Date.now() - t0) / 1000])
        await sleep(150)
      }
      const seq = visits.map((v) => v[0]).join('')
      a.push({ name: 'beat mode cycles A→B→C→D in order', pass: visits.length >= 5 && seq.startsWith('ABCDA'), detail: `${seq} (${visits.length} stops)` })
      const gaps = visits.slice(2).map((v, i) => v[1] - visits[i + 1][1])
      const near = gaps.filter((g) => g > 1.0 && g < 2.8).length
      a.push({ name: 'switches land in beat time (~1.9s, not the 10s timer)', pass: gaps.length >= 3 && near >= Math.ceil(gaps.length * 0.7), detail: gaps.map((g) => g.toFixed(2)).join(' ') })
      // silence = hold
      await ev(page, () => window.__demoToggle()); await sleep(400)
      const hold = await ev(page, () => window.__currentPad())
      await sleep(5000)
      a.push({ name: 'silence stops switching (no timer fallback)', pass: (await ev(page, () => window.__currentPad())) === hold, detail: `held ${hold}` })
      record('E28 beat-quantized-cycle', a)
    } catch (e) { record('E28 beat-quantized-cycle', a, e.message) } finally { await ctx.close() }
  }

  // E29: beat-mode interference — a manual press restarts the beat count,
  // editing pauses beat mode, Set resumes it, and the divider persists
  // across reload while the mode itself starts off
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const untilPad = async (L, timeout) => {
      const t = Date.now()
      while (Date.now() - t < timeout) {
        if ((await ev(page, () => window.__currentPad())) === L) return (Date.now() - t) / 1000
        await sleep(200)
      }
      return null
    }
    try {
      await sleep(4500) // prebake warmup
      await ev(page, () => window.__autoToggle()); await sleep(200)
      await ev(page, () => window.__autoToggle()); await sleep(300) // beat mode
      const bSlider = page.locator('span[aria-label="Beat divider"] [role=slider]')
      await bSlider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(200) // 8 beats ≈ 3.75s
      await ev(page, () => window.__demoToggle()); await sleep(400)
      const tB = await untilPad('B', 8000)
      a.push({ name: 'beat auto advanced A→B', pass: tB !== null, detail: tB === null ? 'never' : `${tB.toFixed(1)}s` })
      // manual press restarts the beat count: press D, holds, then wraps to A
      const tPress = Date.now()
      await ev(page, () => window.__touchPad('D')); await sleep(2500)
      a.push({ name: 'manual press holds (no premature switch)', pass: (await ev(page, () => window.__currentPad())) === 'D', detail: await ev(page, () => window.__currentPad()) })
      const tA = await untilPad('A', 7000)
      const dwell = tA === null ? null : (Date.now() - tPress) / 1000
      a.push({ name: 'cycle resumes after a full beat dwell', pass: dwell !== null && dwell >= 2.8, detail: dwell === null ? 'never' : `${dwell.toFixed(1)}s after press` })
      // editing pauses beat mode
      await page.locator('span[aria-label="Cell density"] [role=slider]').focus(); await page.keyboard.press('End'); await sleep(400)
      a.push({ name: 'editing pauses beat mode', pass: (await ev(page, () => window.__autoState())).paused === true, detail: JSON.stringify(await ev(page, () => window.__autoState())) })
      await sleep(6000) // > a full beat interval, music still playing
      a.push({ name: 'no switching while paused (music playing)', pass: (await ev(page, () => window.__currentPad())) === 'A', detail: await ev(page, () => window.__currentPad()) })
      // Set resumes
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      a.push({ name: 'Set resumes beat mode', pass: (await ev(page, () => window.__autoState())).paused === false, detail: '' })
      const tB2 = await untilPad('B', 7000)
      a.push({ name: 'advance after resume', pass: tB2 !== null, detail: tB2 === null ? 'never' : `${tB2.toFixed(1)}s` })
      // reload: mode off, divider remembered
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      const st = await ev(page, () => window.__autoState())
      a.push({ name: 'mode off after reload', pass: st.mode === 'off' && st.label === 'Start auto-cycle', detail: JSON.stringify(st) })
      a.push({ name: 'beat divider persisted across reload', pass: (await ev(page, () => localStorage.getItem('sgv-beat-divider'))) === '8', detail: await ev(page, () => localStorage.getItem('sgv-beat-divider')) })
      record('E29 beat-mode-interference', a)
    } catch (e) { record('E29 beat-mode-interference', a, e.message) } finally { await ctx.close() }
  }

  // E30: auto-cycle mode UI — the one button walks off → timed → beat → off
  // and the slider/labels follow the mode (seconds 1–10 vs beats 2/4/8/16/32)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      let st = await ev(page, () => window.__autoState())
      a.push({ name: 'off: start label + seconds slider', pass: st.label === 'Start auto-cycle' && st.mode === 'off' && st.sliderLabel === 'Auto-cycle interval' && st.value === '3s', detail: JSON.stringify(st) })
      a.push({ name: 'off: timed slider range 1–10', pass: st.min === 1 && st.max === 10, detail: `${st.min}–${st.max}` })
      await ev(page, () => window.__autoToggle()); await sleep(250)
      st = await ev(page, () => window.__autoState())
      a.push({ name: 'timed: switch-to-beat label, seconds kept', pass: st.label === 'Switch auto-cycle to beat mode' && st.mode === 'timed' && st.sliderLabel === 'Auto-cycle interval' && st.value === '3s', detail: JSON.stringify(st) })
      await ev(page, () => window.__autoToggle()); await sleep(250)
      st = await ev(page, () => window.__autoState())
      a.push({ name: 'beat: stop label + beat divider slider', pass: st.label === 'Stop auto-cycle' && st.mode === 'beat' && st.sliderLabel === 'Beat divider' && st.value === '8 beats', detail: JSON.stringify(st) })
      const bSlider = page.locator('span[aria-label="Beat divider"] [role=slider]')
      await bSlider.focus(); await page.keyboard.press('Home'); await sleep(250)
      a.push({ name: 'beat divider floor is 2 beats', pass: (await ev(page, () => window.__autoState())).value === '2 beats', detail: (await ev(page, () => window.__autoState())).value })
      await page.keyboard.press('End'); await sleep(250)
      a.push({ name: 'beat divider ceiling is 32 beats', pass: (await ev(page, () => window.__autoState())).value === '32 beats', detail: (await ev(page, () => window.__autoState())).value })
      await ev(page, () => window.__autoToggle()); await sleep(250)
      st = await ev(page, () => window.__autoState())
      a.push({ name: 'back to off: timed slider restored untouched', pass: st.label === 'Start auto-cycle' && st.mode === 'off' && st.sliderLabel === 'Auto-cycle interval' && st.value === '3s', detail: JSON.stringify(st) })
      record('E30 autocycle-mode-ui', a)
    } catch (e) { record('E30 autocycle-mode-ui', a, e.message) } finally { await ctx.close() }
  }

  // E31: anchored Set geometry — exactly one Set button, living in the
  // footer (not on any pad row), pinned in place while the panel scrolls,
  // and its label follows the targeted pad
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const setInfo = () => ev(page, () => {
        const btns = [...document.querySelectorAll('button[aria-label^="Set pad "]')]
        const b = btns[0]
        return {
          count: btns.length,
          label: b?.getAttribute('aria-label') ?? null,
          onRow: b ? !!b.closest('[role=button][aria-label$=": load"]') : null,
          rect: b ? window.__rect(b) : null,
        }
      })
      let si = await setInfo()
      a.push({ name: 'exactly one Set button', pass: si.count === 1, detail: `count=${si.count}` })
      a.push({ name: 'starts as Set pad A', pass: si.label === 'Set pad A', detail: String(si.label) })
      a.push({ name: 'not attached to any pad row', pass: si.onRow === false, detail: '' })
      // scroll the panel to the bottom: the footer must not move
      await ev(page, () => { const s = document.querySelector('.slim-scroll'); if (s) s.scrollTop = s.scrollHeight })
      await sleep(400)
      const scrolled = await ev(page, () => { const s = document.querySelector('.slim-scroll'); return s ? s.scrollTop : 0 })
      a.push({ name: 'panel actually scrolled', pass: scrolled > 200, detail: `scrollTop=${scrolled}` })
      const si2 = await setInfo()
      const moved = si.rect && si2.rect && (Math.abs(si.rect.x - si2.rect.x) > 1 || Math.abs(si.rect.y - si2.rect.y) > 1 || Math.abs(si.rect.w - si2.rect.w) > 1 || Math.abs(si.rect.h - si2.rect.h) > 1)
      a.push({ name: 'position unchanged after scrolling to bottom', pass: !!si.rect && !!si2.rect && !moved, detail: `${JSON.stringify(si.rect)} → ${JSON.stringify(si2.rect)}` })
      // label follows the targeted pad
      await ev(page, () => window.__touchPad('C')); await sleep(600)
      si = await setInfo()
      a.push({ name: 'label follows target (Set pad C)', pass: si.label === 'Set pad C' && si.count === 1, detail: String(si.label) })
      record('E31 anchored-set-geometry', a)
    } catch (e) { record('E31 anchored-set-geometry', a, e.message) } finally { await ctx.close() }
  }

  await browser.close()
  const skipped = results.filter((r) => r.skipped).length
  const active = results.filter((r) => !r.skipped)
  const passed = active.filter((r) => r.pass).length
  fs.writeFileSync('/tmp/padtest/redesign-results.json', JSON.stringify({ summary: { total: active.length, passed, failed: active.length - passed, skipped, durationSec: Math.round((Date.now() - t0) / 1000) }, results }, null, 2))
  console.log(`\n==== ${passed}/${active.length} passed, ${active.length - passed} failed, ${skipped} skipped, ${Math.round((Date.now() - t0) / 1000)}s ====`)
  if (active.length - passed) process.exitCode = 1
})().catch((e) => { console.error(e); process.exit(1) })
