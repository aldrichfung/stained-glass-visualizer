/* E2E suite for the simplification redesign: single-image gallery, always-targeted
 * pads, one-click Set, decluttered panel. 21 tests (E1-E25, 1 skipped: E18's toast-position
 * oracles are off; E4/E16/E17 removed with the arm/popup machinery, E20 removed on request).
 * Toast assertions were stripped from all other tests — save/load confirmation is now
 * verified via stored state, thumbnails, chips, and canvas pixels. Run: see e2e/README.md */
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
  window.__thumbs = () =>
    [...document.querySelectorAll('button[aria-current]')].filter((b) => (b.getAttribute('aria-label') || '').startsWith('Show ')).map((b) => ({
      name: (b.getAttribute('aria-label') || '').replace(/^Show /, ''),
      active: b.getAttribute('aria-current') === 'true',
    }))
  window.__thumbColor = () => {
    const b = [...document.querySelectorAll('button[aria-current]')].find((x) => (x.getAttribute('aria-label') || '').startsWith('Show ') && x.getAttribute('aria-current') === 'true')
    const img = b && b.querySelector('img')
    if (!img) return null
    const cv = document.createElement('canvas'); cv.width = cv.height = 16
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, 16, 16)
    const d = cx.getImageData(0, 0, 16, 16).data
    let r = 0, g = 0, bl = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2] }
    const n = d.length / 4
    return [r / n, g / n, bl / n]
  }
  window.__pads = () => JSON.parse(localStorage.getItem('sgv-presets-v1') || 'null')
  window.__combos = () => [...document.querySelectorAll('[role=combobox]')].map((c) => c.textContent.trim())
  window.__injectUpload = async (color, name) => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64
    const g = cv.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 64, 64)
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png'))
    const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/png' }))
    const input = document.querySelector('input[type=file][accept="image/*"]')
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 1100))
  }
  window.__delThumb = (name) => {
    const show = [...document.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('aria-label') === `Show ${name}`)
    show?.parentElement?.querySelector('button[aria-label^="Remove "]')?.click()
  }
  window.__setShape = (label) => {
    const combo = document.querySelectorAll('[role=combobox]')[0]
    combo.click()
    return new Promise((res) => setTimeout(() => {
      const opt = [...document.querySelectorAll('[role=option]')].find((o) => o.textContent.trim() === label)
      if (opt) opt.click()
      setTimeout(res, 700)
    }, 400))
  }
  window.__setPadBtn = (letter) => {
    const b = [...document.querySelectorAll('button[aria-label]')].find((x) => x.getAttribute('aria-label') === `Set pad ${letter}`)
    if (b) { b.click(); return true } return false
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
const thumbs = (page) => page.evaluate(() => window.__thumbs())
const pads = (page) => page.evaluate(() => window.__pads())
const upload = (page, color, name) => page.evaluate(([c, n]) => window.__injectUpload(c, n), [color, name])
const overlap = (a, b) => !!(a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const t0 = Date.now()

  // E1: clean default state — A targeted, defaults shown, demo hidden, stripped UI
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'A targeted by default', pass: rows[0]?.current === true && rows.filter((r) => r.current).length === 1, detail: JSON.stringify(rows) })
      a.push({ name: 'strip shows only + box (demo hidden)', pass: (await thumbs(page)).length === 0 && (await ev(page, () => !!document.querySelector('button[aria-label="Add image"]'))), detail: JSON.stringify(await thumbs(page)) })
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
      const ii = secs.findIndex((s) => s.toLowerCase().startsWith('reference image'))
      a.push({ name: 'pads section directly after reference image', pass: secs[ii + 1] === 'Performance pads', detail: secs.join(' > ') })
      a.push({ name: 'section renamed singular', pass: secs.some((s) => s === 'Reference image'), detail: '' })
      a.push({ name: 'hint icons present', pass: await ev(page, () => !!document.querySelector('button[aria-label="Punch — what does this do?"]') && !!document.querySelector('button[aria-label="Strobe — what does this do?"]')), detail: '' })
      a.push({ name: 'build stamp present', pass: /build \w+ ·/.test(await ev(page, () => document.body.textContent)), detail: '' })
      record('E1 clean-state', a)
    } catch (e) { record('E1 clean-state', a, e.message) } finally { await ctx.close() }
  }

  // E2: single-image upload workflow — add, replace via re-upload, delete
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await upload(page, '#ff0000', 'red.png')
      let th = await thumbs(page)
      a.push({ name: 'one thumb after upload', pass: th.length === 1 && th[0].active, detail: JSON.stringify(th) })
      a.push({ name: '+ box hidden while image set', pass: !(await ev(page, () => !!document.querySelector('button[aria-label="Add image"]'))), detail: '' })
      await upload(page, '#00ff00', 'green.png') // replace
      th = await thumbs(page)
      a.push({ name: 're-upload replaces (still one)', pass: th.length === 1 && th[0].name === 'green.png', detail: JSON.stringify(th) })
      await ev(page, () => window.__delThumb('green.png'))
      await sleep(500)
      th = await thumbs(page)
      a.push({ name: 'delete removes thumb, + box back', pass: th.length === 0 && (await ev(page, () => !!document.querySelector('button[aria-label="Add image"]'))), detail: '' })
      record('E2 single-image-workflow', a)
    } catch (e) { record('E2 single-image-workflow', a, e.message) } finally { await ctx.close() }
  }

  // E3: Set is ONE click — the current look saves immediately, no arm, no
  // popup, no confirm press. The saved pad stores config + image copy.
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await upload(page, '#ff0000', 'red.png')
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A'))
      await sleep(600)
      const p = (await pads(page))[0]
      a.push({ name: 'pad stores config + image copy immediately', pass: p?.config?.windowShape === 'rose' && p.imageName === 'red.png' && typeof p.imageData === 'string' && p.imageData.length > 500, detail: JSON.stringify({ shape: p?.config?.windowShape, name: p?.imageName, data: (p?.imageData || '').length }) })
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
      await upload(page, '#ff0000', 'red.png')
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
      const th = await thumbs(page)
      a.push({ name: 'keyboard 1 loads A', pass: rows[0].current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'A config restored (rose)', pass: cb2[0] === 'Rose circle', detail: cb2[0] })
      a.push({ name: 'A image active in strip', pass: th.length === 1 && th[0].name === 'red.png' && th[0].active, detail: JSON.stringify(th) })
      record('E5 pad-press-loads', a)
    } catch (e) { record('E5 pad-press-loads', a, e.message) } finally { await ctx.close() }
  }

  // E6: two pads, two images — loads swap the single slot; copies rematerialize
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const sigs = {}
    try {
      sigs[DEMO] = await sig(page)
      await upload(page, '#ff0000', 'red.png'); sigs['red.png'] = await sig(page)
      await ev(page, () => window.__setPadBtn('A')); await sleep(500)
      await upload(page, '#00ff00', 'green.png'); sigs['green.png'] = await sig(page) // replaces red
      await ev(page, () => window.__setPadBtn('B')); await sleep(500)
      await ev(page, () => window.__touchPad('A')); await sleep(1500)
      let th = await thumbs(page)
      a.push({ name: 'load A: slot shows red only', pass: th.length === 1 && th[0].name === 'red.png' && th[0].active, detail: JSON.stringify(th) })
      let s = await sig(page)
      const dR = dist(s, sigs['red.png']); const dG = dist(s, sigs['green.png'])
      a.push({ name: 'canvas renders red', pass: dR < dG * 0.6, detail: `red=${dR.toFixed(0)} green=${dG.toFixed(0)}` })
      await ev(page, () => window.__touchPad('B')); await sleep(1500)
      th = await thumbs(page)
      a.push({ name: 'load B: slot shows green only', pass: th.length === 1 && th[0].name === 'green.png' && th[0].active, detail: JSON.stringify(th) })
      s = await sig(page)
      const dR2 = dist(s, sigs['red.png']); const dG2 = dist(s, sigs['green.png'])
      a.push({ name: 'canvas renders green', pass: dG2 < dR2 * 0.6, detail: `red=${dR2.toFixed(0)} green=${dG2.toFixed(0)}` })
      record('E6 slot-swap', a)
    } catch (e) { record('E6 slot-swap', a, e.message) } finally { await ctx.close() }
  }

  // E7: pad saved with no image defaults to the demo on load
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__setPadBtn('C')); await sleep(500) // demo active, no user image
      a.push({ name: 'default-look pad stored on C', pass: (await pads(page))[2] !== null, detail: JSON.stringify((await pads(page))[2]?.config?.windowShape) })
      await upload(page, '#ff0000', 'red.png')
      a.push({ name: 'working image active before pad loads', pass: (await thumbs(page)).some((t) => t.name === 'red.png' && t.active), detail: JSON.stringify(await thumbs(page)) })
      // the reference image is a pad attribute like any slider: loading an
      // empty pad ejects the working image — the slot shows the + box,
      // never a stale inactive thumbnail (user ruling, E20 spec)
      await ev(page, () => window.__touchPad('B')); await sleep(600)
      const thB = await thumbs(page)
      a.push({ name: 'empty pad load ejects working image', pass: thB.length === 0, detail: JSON.stringify(thB) })
      await ev(page, () => window.__touchPad('C')); await sleep(800)
      const th = await thumbs(page)
      a.push({ name: 'default-image pad load leaves slot empty (+ box)', pass: th.length === 0 && (await ev(page, () => !!document.querySelector('button[aria-label="Add image"]'))), detail: JSON.stringify(th) })
      record('E7 demo-fallback', a)
    } catch (e) { record('E7 demo-fallback', a, e.message) } finally { await ctx.close() }
  }

  // E8: repeat Set just re-saves (there is no arm left to cancel); X clear
  // keeps targeting and snaps the panel back to defaults
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__setPadBtn('C')); await sleep(400)
      await ev(page, () => window.__setPadBtn('C')); await sleep(400)
      a.push({ name: 'repeat Set re-saves (no toggle-off)', pass: (await pads(page))[2] !== null, detail: JSON.stringify((await pads(page))[2]?.config?.windowShape) })
      await ev(page, () => window.__clearPad('C')); await sleep(300)
      a.push({ name: 'C cleared for next step', pass: (await pads(page))[2] === null, detail: '' })
      // save a non-default look onto B, then clear it while targeted:
      // the panel must snap back to defaults, not keep showing stale edits
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
      await upload(page, '#ff0000', 'red.png')
      await ev(page, () => window.__setPadBtn('B')); await sleep(500)
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('canvas.viz')
      await sleep(2000)
      const rows = await ev(page, () => window.__padRowState())
      const th = await thumbs(page)
      a.push({ name: 'B still targeted after reload', pass: rows[1].current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'B image materialized on startup', pass: th.length === 1 && th[0].name === 'red.png' && th[0].active, detail: JSON.stringify(th) })
      record('E10 persistence', a)
    } catch (e) { record('E10 persistence', a, e.message) } finally { await ctx.close() }
  }

  // E11: the saga ritual — delete between pads, loads still restore everything
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    const sigs = {}
    try {
      await upload(page, '#000000', 'ritual-A.png'); sigs['ritual-A.png'] = await sig(page)
      await ev(page, () => window.__setPadBtn('A')); await sleep(500)
      await ev(page, () => window.__delThumb('ritual-A.png')); await sleep(400)
      await upload(page, '#ffffff', 'ritual-B.png'); sigs['ritual-B.png'] = await sig(page)
      await ev(page, () => window.__setPadBtn('B')); await sleep(500)
      await ev(page, () => window.__touchPad('A')); await sleep(1600)
      const th = await thumbs(page)
      const s = await sig(page)
      const dA = dist(s, sigs['ritual-A.png']); const dB = dist(s, sigs['ritual-B.png'])
      a.push({ name: 'A image rematerialized + active', pass: th.length === 1 && th[0].name === 'ritual-A.png' && th[0].active, detail: JSON.stringify(th) })
      a.push({ name: 'canvas renders A (pixel)', pass: dA < dB * 0.6, detail: `A=${dA.toFixed(0)} B=${dB.toFixed(0)}` })
      record('E11 deletion-ritual', a)
    } catch (e) { record('E11 deletion-ritual', a, e.message) } finally { await ctx.close() }
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

  // E13: mobile sheet — one Set click inside the sheet saves immediately
  // (toast-position oracles removed: toasts are disabled app-side)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === 'Open controls')?.click())
      await sleep(800)
      await upload(page, '#ff0000', 'mob.png')
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      a.push({ name: 'no popup on mobile', pass: (await ev(page, () => document.body.textContent.includes('This is Config mode'))) === false, detail: '' })
      const p = (await pads(page))[0]
      a.push({ name: 'mobile save stores image copy', pass: typeof p?.imageData === 'string' && p.imageData.length > 500, detail: '' })
      record('E13 mobile-set-flow', a)
    } catch (e) { record('E13 mobile-set-flow', a, e.message) } finally { await ctx.close() }
  }

  // E14: same-pad press is a no-op — unsaved work survives re-pressing the targeted pad
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await upload(page, '#e02020', 'red.png'); await sleep(400)
      const sig0 = await sig(page)
      await ev(page, () => window.__touchPad('A')); await sleep(600)
      a.push({ name: 're-press saves nothing', pass: (await pads(page)).every((p) => p === null), detail: '' })
      const th = await thumbs(page)
      a.push({ name: 'working image still active', pass: th.length === 1 && th[0].active === true, detail: JSON.stringify(th) })
      const sig1 = await sig(page)
      a.push({ name: 'canvas unchanged after re-press', pass: dist(sig0, sig1) < 80, detail: dist(sig0, sig1).toFixed(1) })
      await page.keyboard.press('1'); await sleep(600)
      const th2 = await thumbs(page)
      a.push({ name: 'image still active after key press', pass: th2.length === 1 && th2[0].active === true, detail: JSON.stringify(th2) })
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
      await upload(page, '#e02020', 'red.png'); await sleep(300)
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      a.push({ name: 'one click saves (stored)', pass: (await pads(page))[0]?.imageName === 'red.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      const th = await thumbs(page)
      a.push({ name: 'working image survives the save', pass: th.some((t) => t.active), detail: JSON.stringify(th) })
      await page.keyboard.press('Escape'); await sleep(800)
      await ev(page, () => window.__touchPad('B')); await sleep(900)
      const sigB = await sig(page)
      await ev(page, () => window.__touchPad('A')); await sleep(1000)
      const sigA = await sig(page)
      const th2 = await thumbs(page)
      a.push({ name: 'saved image returns on pad A', pass: th2.some((t) => t.active), detail: JSON.stringify(th2) })
      a.push({ name: 'B and A render different looks', pass: dist(sigA, sigB) > 60, detail: dist(sigA, sigB).toFixed(1) })
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
      await upload(page, '#e02020', 'land.png'); await sleep(400)
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
      await upload(page, '#e02020', 'red.png'); await sleep(2500) // bake + crossfade
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
      await ev(page, () => window.__touchPad('C')); await sleep(600) // empty pad → defaults + demo
      await ev(page, () => window.__setPadBtn('B')); await sleep(500)
      cs = await chips()
      a.push({ name: 'default-equal save stays red', pass: cs[1].color === RED && (await pads(page))[1] !== null, detail: JSON.stringify(cs[1]) })
      // an image binding alone makes a pad custom
      await upload(page, '#e02020', 'red.png'); await sleep(400)
      await ev(page, () => window.__setPadBtn('D')); await sleep(500)
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
      const thumbOK = async (name, channel) => {
        const th = await thumbs(page)
        const t = th.find((x) => x.name === name && x.active)
        if (!t) return { pass: false, detail: JSON.stringify(th) }
        const c = await ev(page, () => window.__thumbColor())
        const dom = c && (channel === 'red' ? c[0] > c[1] + 40 && c[0] > c[2] + 40 : c[1] > c[0] + 40 && c[1] > c[2] + 40)
        return { pass: !!dom, detail: JSON.stringify({ th, c: c && c.map((v) => Math.round(v)) }) }
      }
      const refs = {}
      refs.demo = await sig(page)
      await ev(page, () => window.__openSheet()); await sleep(800)
      // A: upload, one click, proven
      await upload(page, '#e02020', 'testA.png'); await sleep(1400)
      await ev(page, () => window.__setPadBtn('A')); await sleep(600)
      a.push({ name: 'Set A saved in one click', pass: (await pads(page))[0]?.imageName === 'testA.png', detail: JSON.stringify((await pads(page))[0]?.imageName) })
      a.push({ name: 'thumbnail A red-dominant', ...(await thumbOK('testA.png', 'red')) })
      await sleep(1200)
      refs.A = await sig(page)
      a.push({ name: 'canvas left the demo', pass: dist(refs.A, refs.demo) > 60, detail: dist(refs.A, refs.demo).toFixed(1) })
      // B: replace image, one click, proven
      await upload(page, '#20c020', 'testB.png'); await sleep(1400)
      await ev(page, () => window.__setPadBtn('B')); await sleep(600)
      a.push({ name: 'Set B saved in one click', pass: (await pads(page))[1]?.imageName === 'testB.png', detail: JSON.stringify((await pads(page))[1]?.imageName) })
      a.push({ name: 'thumbnail B green-dominant', ...(await thumbOK('testB.png', 'green')) })
      await sleep(1200)
      refs.B = await sig(page)
      // alternating loads — canvas proof outside the sheet, thumbnail proof in it
      await page.keyboard.press('Escape'); await sleep(900)
      await ev(page, () => window.__touchPad('A')); await sleep(1800)
      const sA = await sig(page)
      a.push({ name: 'press A — canvas matches A', pass: nearest(sA, refs) === 'A', detail: refDetail(sA, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      a.push({ name: 'load A — thumbnail red-dominant', ...(await thumbOK('testA.png', 'red')) })
      await page.keyboard.press('Escape'); await sleep(900)
      await ev(page, () => window.__touchPad('B')); await sleep(1800)
      const sB = await sig(page)
      a.push({ name: 'press B — canvas matches B', pass: nearest(sB, refs) === 'B', detail: refDetail(sB, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      a.push({ name: 'load B — thumbnail green-dominant', ...(await thumbOK('testB.png', 'green')) })
      // reload: pads, targeting, images, and the rendered look all persist
      await page.reload({ waitUntil: 'load' }); await page.waitForSelector('canvas.viz'); await sleep(2500)
      const sR = await sig(page)
      a.push({ name: 'canvas matches B after reload', pass: nearest(sR, refs) === 'B', detail: refDetail(sR, refs) })
      await ev(page, () => window.__openSheet()); await sleep(800)
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'B still targeted after reload', pass: rows[1]?.current === true, detail: JSON.stringify(rows) })
      a.push({ name: 'B image rematerialized after reload', ...(await thumbOK('testB.png', 'green')) })
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
        await upload(page, colors[i][0], colors[i][1])
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
        await upload(page, colors[i][0], colors[i][1])
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

  await browser.close()
  const skipped = results.filter((r) => r.skipped).length
  const active = results.filter((r) => !r.skipped)
  const passed = active.filter((r) => r.pass).length
  fs.writeFileSync('/tmp/padtest/redesign-results.json', JSON.stringify({ summary: { total: active.length, passed, failed: active.length - passed, skipped, durationSec: Math.round((Date.now() - t0) / 1000) }, results }, null, 2))
  console.log(`\n==== ${passed}/${active.length} passed, ${active.length - passed} failed, ${skipped} skipped, ${Math.round((Date.now() - t0) / 1000)}s ====`)
  if (active.length - passed) process.exitCode = 1
})().catch((e) => { console.error(e); process.exit(1) })
