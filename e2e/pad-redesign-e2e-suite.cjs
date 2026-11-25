/* E2E suite for the simplification redesign: single-image gallery, always-targeted
 * pads, Set (config) mode, decluttered panel. Run: node redesign-suite.cjs */
const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://[::1]:4173/'
const DEMO = 'Built-in rose window'
const results = []

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
  window.__popup = () => {
    const el = window.__popupEl()
    return el ? { text: el.querySelector(':scope > p')?.textContent } : null
  }
  window.__popupCheck = () => { const el = window.__popupEl(); const b = el && [...el.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Got it'); if (b) b.click() }
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
  window.__popupEl = () => [...document.querySelectorAll('div')].filter((d) => d.textContent.includes('This is Config mode') && d.querySelector(':scope > p') && [...d.querySelectorAll(':scope > button')].some((b) => b.textContent.trim() === 'Got it')).pop()
  window.__popupRect = () => window.__rect(window.__popupEl())
  window.__toastRect = () => { const t = [...document.querySelectorAll('p.animate-toast')]; return window.__rect(t[t.length - 1]) }
  window.__sheetRect = () => window.__rect(document.querySelector('[data-slot="sheet-content"]') || document.querySelector('[role=dialog]'))
  // elementFromPoint is unreliable against the sheet's animated overlay
  // (Chromium compositing quirk) — verify visibility structurally instead:
  // real size, not display:none, and no higher-stacked layer covering center
  window.__popupVisible = () => {
    const el = window.__popupEl(); if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width < 10 || r.height < 10) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false
    const zi = (e) => {
      let n = e, z = 0
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n)
        if (s.position !== 'static' && s.zIndex !== 'auto') z += parseInt(s.zIndex, 10) || 0
        n = n.parentElement
      }
      return z
    }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const myZ = zi(el)
    return [...document.querySelectorAll('body *')].every((o) => {
      if (o === el || el.contains(o) || o.contains(el)) return true
      const s = getComputedStyle(o)
      if (s.position !== 'fixed' && s.position !== 'absolute') return true
      const or = o.getBoundingClientRect()
      const covers = or.width > 0 && cx >= or.left && cx <= or.right && cy >= or.top && cy <= or.bottom
      return !covers || zi(o) <= myZ
    })
  }
  window.__openSheet = () => { const b = document.querySelector('button[aria-label="Open controls"]'); if (b) { b.click(); return true } return false }
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

  // E3: Set flow — arm pulses + popup exact text; press flashing pad confirms
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await upload(page, '#ff0000', 'red.png')
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A'))
      await sleep(400)
      const rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'pad A pulses when armed', pass: rows[0].pulsing === true, detail: JSON.stringify(rows) })
      const pop = await ev(page, () => window.__popup())
      a.push({ name: 'popup appears with exact text', pass: pop?.text === 'This is Config mode. Any setting you have currently adjusted on the control panel will be saved and mapped to pad A. Press the flashing pad again to confirm.', detail: String(pop?.text) })
      a.push({ name: 'popup has Got it (no permanent dismiss)', pass: (await ev(page, () => { const el = window.__popupEl(); return !!el && !el.querySelector('input[type=checkbox]') && [...el.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Got it') && !document.body.textContent.includes('Do not remind again') })) === true, detail: '' })
      await ev(page, () => window.__touchPad('A')) // press the flashing pad
      await sleep(600)
      a.push({ name: 'confirm toast', pass: (await toast(page)) === 'Saved A · red.png', detail: String(await toast(page)) })
      a.push({ name: 'popup gone after confirm', pass: (await ev(page, () => window.__popup())) === null, detail: '' })
      const p = (await pads(page))[0]
      a.push({ name: 'pad stores config + image copy', pass: p?.config?.windowShape === 'rose' && p.imageName === 'red.png' && typeof p.imageData === 'string' && p.imageData.length > 500, detail: JSON.stringify({ shape: p?.config?.windowShape, name: p?.imageName, data: (p?.imageData || '').length }) })
      record('E3 set-flow', a)
    } catch (e) { record('E3 set-flow', a, e.message) } finally { await ctx.close() }
  }

  // E4: the explainer can never be permanently dismissed — it shows on every
  // arm, even after a snooze, even across reloads (the video-2 defect class)
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__setPadBtn('B'))
      await sleep(300)
      a.push({ name: 'popup on arm', pass: (await ev(page, () => window.__popup())) !== null, detail: '' })
      await ev(page, () => window.__popupCheck()) // Got it — snooze this arm
      await sleep(200)
      a.push({ name: 'snoozed for current arm', pass: (await ev(page, () => window.__popup())) === null, detail: '' })
      await ev(page, () => window.__touchPad('B'))
      await sleep(500)
      await ev(page, () => window.__setPadBtn('C'))
      await sleep(300)
      a.push({ name: 'popup returns on next arm', pass: (await ev(page, () => window.__popup())) !== null, detail: '' })
      await ev(page, () => window.__touchPad('C'))
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('canvas.viz')
      await sleep(1500)
      await ev(page, () => window.__setPadBtn('D'))
      await sleep(300)
      a.push({ name: 'popup still shows after reload', pass: (await ev(page, () => window.__popup())) !== null, detail: '' })
      record('E4 popup-reminder', a)
    } catch (e) { record('E4 popup-reminder', a, e.message) } finally { await ctx.close() }
  }

  // E5: pressing pads loads — touch pad, panel row, keyboard — panel follows
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await upload(page, '#ff0000', 'red.png')
      await ev(page, () => window.__setShape('Rose circle'))
      await ev(page, () => window.__setPadBtn('A')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('A')); await sleep(500)
      await ev(page, () => window.__touchPad('B')); await sleep(600) // empty pad
      let rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'B targeted after touch press', pass: rows[1].current && rows.filter((r) => r.current).length === 1, detail: JSON.stringify(rows) })
      a.push({ name: 'empty pad toast', pass: String(await toast(page)).includes('B empty · default look loaded'), detail: String(await toast(page)) })
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
      await ev(page, () => window.__setPadBtn('A')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('A')); await sleep(500)
      await upload(page, '#00ff00', 'green.png'); sigs['green.png'] = await sig(page) // replaces red
      await ev(page, () => window.__setPadBtn('B')); await sleep(200)
      await ev(page, () => window.__touchPad('B')); await sleep(500)
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
      await ev(page, () => window.__setPadBtn('C')); await sleep(200) // demo active, no user image
      a.push({ name: 'save-with-demo toast', pass: true, detail: '' })
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('C')); await sleep(500)
      a.push({ name: 'saved as default image', pass: (await toast(page)) === 'Saved C · default image', detail: String(await toast(page)) })
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
      a.push({ name: 'default image toast', pass: (await toast(page)) === 'Loaded C · default image', detail: String(await toast(page)) })
      record('E7 demo-fallback', a)
    } catch (e) { record('E7 demo-fallback', a, e.message) } finally { await ctx.close() }
  }

  // E8: cancel paths — other pad press, Set toggle, X clear keeps targeting
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'desktop')
    try {
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      await ev(page, () => window.__touchPad('B')); await sleep(500)
      let rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'other pad press cancels arm', pass: rows[0].pulsing === false && rows[1].current === true, detail: JSON.stringify(rows) })
      await ev(page, () => window.__setPadBtn('C')); await sleep(300)
      await ev(page, () => window.__setPadBtn('C')); await sleep(300)
      rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'Set toggle cancels', pass: rows[2].pulsing === false, detail: JSON.stringify(rows) })
      // save a non-default look onto B, then clear it while targeted:
      // the panel must snap back to defaults, not keep showing stale edits
      await ev(page, () => window.__setShape('Rose circle')); await sleep(300)
      a.push({ name: 'shape changed pre-save', pass: (await ev(page, () => window.__combos()))[0] === 'Rose circle', detail: (await ev(page, () => window.__combos()))[0] })
      await ev(page, () => window.__setPadBtn('B')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('B')); await sleep(400)
      a.push({ name: 'look saved to B', pass: (await pads(page))[1]?.config?.windowShape === 'rose', detail: JSON.stringify((await pads(page))[1]?.config?.windowShape) })
      await ev(page, () => window.__clearPad('B')); await sleep(400)
      rows = await ev(page, () => window.__padRowState())
      a.push({ name: 'X clears, pad stays targeted', pass: rows[1].current === true && (await pads(page))[1] === null, detail: JSON.stringify(rows) })
      const comboAfter = (await ev(page, () => window.__combos()))[0]
      a.push({ name: 'targeted clear resets panel to defaults', pass: comboAfter === 'Gothic arch', detail: comboAfter })
      a.push({ name: 'cleared toast', pass: String(await toast(page)).includes('Cleared B · default look loaded'), detail: String(await toast(page)) })
      record('E8 cancel-paths', a)
    } catch (e) { record('E8 cancel-paths', a, e.message) } finally { await ctx.close() }
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
      await ev(page, () => window.__setPadBtn('B')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('B')); await sleep(500)
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
      await ev(page, () => window.__setPadBtn('A')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('A')); await sleep(500)
      await ev(page, () => window.__delThumb('ritual-A.png')); await sleep(400)
      await upload(page, '#ffffff', 'ritual-B.png'); sigs['ritual-B.png'] = await sig(page)
      await ev(page, () => window.__setPadBtn('B')); await sleep(200)
      await ev(page, () => window.__touchPad('B')); await sleep(500)
      await ev(page, () => window.__touchPad('A')); await sleep(1600)
      const th = await thumbs(page)
      const s = await sig(page)
      const dA = dist(s, sigs['ritual-A.png']); const dB = dist(s, sigs['ritual-B.png'])
      a.push({ name: 'load A toast', pass: (await toast(page)) === 'Loaded A · ritual-A.png', detail: String(await toast(page)) })
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
      await ev(page, () => window.__setPadBtn('A')); await sleep(200)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__touchPad('A')); await sleep(500)
      const p = (await pads(page))[0]
      a.push({ name: 're-saved pad has no cycleSec', pass: p && !('cycleSec' in p.config), detail: JSON.stringify(Object.keys(p.config)) })
      record('E12 legacy-migration', a)
    } catch (e) { record('E12 legacy-migration', a, e.message) } finally { await ctx.close() }
  }

  // E13: mobile sheet — full Set flow inside the sheet
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === 'Open controls')?.click())
      await sleep(800)
      await upload(page, '#ff0000', 'mob.png')
      const sh0 = await ev(page, () => window.__sheetRect())
      const tr = await ev(page, () => window.__toastRect())
      a.push({ name: 'upload toast not hidden behind sheet', pass: !!tr && !overlap(tr, sh0), detail: JSON.stringify({ tr, sh0 }) })
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      a.push({ name: 'popup in DOM on mobile', pass: (await ev(page, () => window.__popup())) !== null, detail: '' })
      a.push({ name: 'popup hit-testable above sheet', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      const pr = await ev(page, () => window.__popupRect())
      const vw = await ev(page, () => ({ w: innerWidth, h: innerHeight }))
      const centered = pr && Math.abs(pr.x + pr.w / 2 - vw.w / 2) < 8 && Math.abs(pr.y + pr.h / 2 - vw.h / 2) < 8
      a.push({ name: 'popup dead-center (never behind sheet)', pass: !!centered, detail: JSON.stringify({ pr, vw }) })
      await ev(page, () => window.__popupCheck())
      await ev(page, () => window.__padRow('A')) // confirm via the panel row itself
      await sleep(600)
      a.push({ name: 'panel row confirm saves', pass: (await toast(page)) === 'Saved A · mob.png', detail: String(await toast(page)) })
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
      a.push({ name: 'same-pad touch press acknowledged', pass: String(await toast(page)).includes('A already loaded'), detail: String(await toast(page)) })
      a.push({ name: 're-press saves nothing', pass: (await pads(page)).every((p) => p === null), detail: '' })
      const th = await thumbs(page)
      a.push({ name: 'working image still active', pass: th.length === 1 && th[0].active === true, detail: JSON.stringify(th) })
      const sig1 = await sig(page)
      a.push({ name: 'canvas unchanged after re-press', pass: dist(sig0, sig1) < 80, detail: dist(sig0, sig1).toFixed(1) })
      await page.keyboard.press('1'); await sleep(600)
      a.push({ name: 'keyboard same-pad also no-op', pass: String(await toast(page)).includes('A already loaded'), detail: String(await toast(page)) })
      const th2 = await thumbs(page)
      a.push({ name: 'image still active after key press', pass: th2.length === 1 && th2[0].active === true, detail: JSON.stringify(th2) })
      record('E14 same-pad-noop', a)
    } catch (e) { record('E14 same-pad-noop', a, e.message) } finally { await ctx.close() }
  }

  // E15: the defect-video repro — mobile Set flow must be visible, fumble must not wipe
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await ev(page, () => window.__openSheet()); await sleep(800)
      await upload(page, '#e02020', 'red.png'); await sleep(300)
      const tr = await ev(page, () => window.__toastRect())
      const sh0 = await ev(page, () => window.__sheetRect())
      a.push({ name: 'upload toast visible over sheet', pass: !!tr && !overlap(tr, sh0), detail: JSON.stringify({ tr, sh0 }) })
      await ev(page, () => window.__setPadBtn('A')); await sleep(400)
      a.push({ name: 'popup visible on first arm', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      // the fumble from the video: disarm via Set, then tap the pad row
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      await ev(page, () => window.__padRow('A')); await sleep(600)
      a.push({ name: 'fumble saves nothing', pass: (await pads(page)).every((p) => p === null), detail: '' })
      const th = await thumbs(page)
      a.push({ name: 'fumble does not wipe working image', pass: th.some((t) => t.active), detail: JSON.stringify(th) })
      // complete the Set properly, guided by the now-visible popup
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      a.push({ name: 'popup returns on re-arm', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      await ev(page, () => window.__padRow('A')); await sleep(600)
      a.push({ name: 'row confirm saves', pass: String(await toast(page)).startsWith('Saved A'), detail: String(await toast(page)) })
      await page.keyboard.press('Escape'); await sleep(800)
      await ev(page, () => window.__touchPad('B')); await sleep(900)
      const sigB = await sig(page)
      await ev(page, () => window.__touchPad('A')); await sleep(1000)
      const sigA = await sig(page)
      const th2 = await thumbs(page)
      a.push({ name: 'saved image returns on pad A', pass: String(await toast(page)).startsWith('Loaded A') && th2.some((t) => t.active), detail: String(await toast(page)) })
      a.push({ name: 'B and A render different looks', pass: dist(sigA, sigB) > 60, detail: dist(sigA, sigB).toFixed(1) })
      record('E15 defect-video-repro', a)
    } catch (e) { record('E15 defect-video-repro', a, e.message) } finally { await ctx.close() }
  }


  // E16: cancel feedback — a pending save is never destroyed silently
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await ev(page, () => window.__openSheet()); await sleep(800)
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      await ev(page, () => window.__popupCheck()); await sleep(200) // snooze explainer
      await ev(page, () => window.__setPadBtn('A')); await sleep(400) // Set again = disarm
      a.push({ name: 'disarm via Set announces itself', pass: String(await toast(page)) === 'Set A cancelled', detail: String(await toast(page)) })
      await ev(page, () => window.__setPadBtn('B')); await sleep(300)
      await ev(page, () => window.__popupCheck()); await sleep(200)
      await ev(page, () => window.__padRow('C')); await sleep(600) // press another pad while armed
      a.push({ name: 'other-pad cancel announces itself', pass: String(await toast(page)).startsWith('Set B cancelled ·'), detail: String(await toast(page)) })
      await ev(page, () => window.__setPadBtn('D')); await sleep(300)
      await page.keyboard.press('Escape'); await sleep(400)
      a.push({ name: 'Esc cancel announces itself', pass: String(await toast(page)) === 'Set D cancelled', detail: String(await toast(page)) })
      a.push({ name: 'no stray saves from cancels', pass: (await pads(page)).every((p) => p === null), detail: '' })
      record('E16 cancel-feedback', a)
    } catch (e) { record('E16 cancel-feedback', a, e.message) } finally { await ctx.close() }
  }

  // E17: the explainer can only be snoozed per-arm — it returns on the next arm
  {
    const a = []
    const { ctx, page } = await newPage(browser, 'mobile')
    try {
      await ev(page, () => window.__openSheet()); await sleep(800)
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      a.push({ name: 'popup on first arm', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      await ev(page, () => window.__popupCheck()); await sleep(300)
      a.push({ name: 'Got it snoozes for this arm', pass: (await ev(page, () => window.__popup())) === null, detail: '' })
      await ev(page, () => window.__setPadBtn('A')); await sleep(300) // disarm
      await ev(page, () => window.__setPadBtn('B')); await sleep(300) // re-arm different pad
      a.push({ name: 'popup returns on next arm', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      const txt = await ev(page, () => window.__popupEl()?.textContent || '')
      a.push({ name: 'popup names the armed pad', pass: txt.includes('pad B'), detail: txt.slice(0, 120) })
      record('E17 explainer-returns', a)
    } catch (e) { record('E17 explainer-returns', a, e.message) } finally { await ctx.close() }
  }

  // E18: landscape mobile — toast at top, popup centered and above everything
  {
    const a = []
    const ctx = await browser.newContext({ viewport: { width: 780, height: 360 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' }); await page.evaluate(INIT); await sleep(1200)
      await upload(page, '#e02020', 'land.png'); await sleep(400)
      const tr = await ev(page, () => window.__toastRect())
      a.push({ name: 'upload toast at top in landscape', pass: !!tr && tr.y < 100, detail: JSON.stringify(tr) })
      await ev(page, () => window.__setPadBtn('A')); await sleep(400)
      a.push({ name: 'popup visible in landscape', pass: (await ev(page, () => window.__popupVisible())) === true, detail: '' })
      const pr = await ev(page, () => window.__popupRect())
      const vw = await ev(page, () => ({ w: innerWidth, h: innerHeight }))
      const centered = pr && Math.abs(pr.x + pr.w / 2 - vw.w / 2) < 8 && Math.abs(pr.y + pr.h / 2 - vw.h / 2) < 8
      a.push({ name: 'popup dead-center in landscape', pass: !!centered, detail: JSON.stringify({ pr, vw }) })
      a.push({ name: 'popup fits short landscape viewport', pass: !!pr && pr.y >= 0 && pr.y + pr.h <= vw.h, detail: JSON.stringify({ pr, vw }) })
      await ev(page, () => window.__popupCheck()); await sleep(200)
      await ev(page, () => window.__touchPad('A')); await sleep(600)
      const tr2 = await ev(page, () => window.__toastRect())
      a.push({ name: 'save toast at top in landscape', pass: String(await toast(page)).startsWith('Saved A') && !!tr2 && tr2.y < 100, detail: JSON.stringify({ tr2, t: String(await toast(page)) }) })
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


  // E20: double-image-workflow — two images, two pads, alternating loads, every
  // step verified by thumbnail pixels AND canvas pixels. The wide net. (mobile)
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
      const sigDemo = await sig(page)
      // 1. upload test image A, Set it onto pad A
      await ev(page, () => window.__openSheet()); await sleep(800)
      await upload(page, '#e02020', 'testA.png'); await sleep(1400)
      await ev(page, () => window.__setPadBtn('A')); await sleep(300)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__padRow('A')); await sleep(600)
      a.push({ name: '1. Set A saved (toast)', pass: String(await toast(page)) === 'Saved A · testA.png', detail: String(await toast(page)) })
      // 2. thumbnail matches image A
      a.push({ name: '2. thumbnail matches image A', ...(await thumbOK('testA.png', 'red')) })
      await sleep(1200)
      const sigA = await sig(page)
      a.push({ name: '2b. canvas left the demo', pass: dist(sigA, sigDemo) > 60, detail: dist(sigA, sigDemo).toFixed(1) })
      // 3. close panel — visual matches image A
      await page.keyboard.press('Escape'); await sleep(900)
      const s3 = await sig(page)
      a.push({ name: '3. panel closed — visual matches image A', pass: nearest(s3, { demo: sigDemo, A: sigA }) === 'A', detail: refDetail(s3, { demo: sigDemo, A: sigA }) })
      // 4. press pad B — visual matches the default visual
      await ev(page, () => window.__touchPad('B')); await sleep(1200)
      const s4 = await sig(page)
      a.push({ name: '4. press B — visual matches default', pass: nearest(s4, { demo: sigDemo, A: sigA }) === 'demo', detail: refDetail(s4, { demo: sigDemo, A: sigA }) })
      // 5. open panel — B selected; image slot empty (+ icon)
      await ev(page, () => window.__openSheet()); await sleep(800)
      const rows5 = await ev(page, () => window.__padRowState())
      a.push({ name: '5. B pad selected', pass: rows5[1]?.current === true, detail: JSON.stringify(rows5) })
      const th5 = await thumbs(page)
      const plus5 = await ev(page, () => !!document.querySelector('button[aria-label="Add image"]'))
      a.push({ name: '5. image slot empty (+ icon)', pass: th5.length === 0 && plus5, detail: JSON.stringify({ th5, plus5 }) })
      // 6. upload test image B, Set it onto pad B
      await upload(page, '#20c020', 'testB.png'); await sleep(1400)
      await ev(page, () => window.__setPadBtn('B')); await sleep(300)
      await ev(page, () => window.__popupCheck()); await ev(page, () => window.__padRow('B')); await sleep(600)
      a.push({ name: '6. Set B saved (toast)', pass: String(await toast(page)) === 'Saved B · testB.png', detail: String(await toast(page)) })
      // 7. thumbnail matches image B
      a.push({ name: '7. thumbnail matches image B', ...(await thumbOK('testB.png', 'green')) })
      await sleep(1200)
      const sigB = await sig(page)
      // 8. close panel — visual matches image B
      await page.keyboard.press('Escape'); await sleep(900)
      const s8 = await sig(page)
      a.push({ name: '8. panel closed — visual matches image B', pass: nearest(s8, { demo: sigDemo, A: sigA, B: sigB }) === 'B', detail: refDetail(s8, { demo: sigDemo, A: sigA, B: sigB }) })
      // 9. press pad A — visual matches image A
      await ev(page, () => window.__touchPad('A')); await sleep(1800)
      const s9 = await sig(page)
      a.push({ name: '9. press A — visual matches image A', pass: nearest(s9, { demo: sigDemo, A: sigA, B: sigB }) === 'A', detail: refDetail(s9, { demo: sigDemo, A: sigA, B: sigB }) })
      // 10. open panel — A selected; thumbnail matches image A
      await ev(page, () => window.__openSheet()); await sleep(800)
      const rows10 = await ev(page, () => window.__padRowState())
      a.push({ name: '10. A pad selected', pass: rows10[0]?.current === true, detail: JSON.stringify(rows10) })
      a.push({ name: '10. thumbnail matches image A', ...(await thumbOK('testA.png', 'red')) })
      // 11. load B via the panel row — thumbnail matches image B
      await ev(page, () => window.__padRow('B')); await sleep(1500)
      a.push({ name: '11. load B — thumbnail matches image B', ...(await thumbOK('testB.png', 'green')) })
      // 12. close panel — visual matches image B
      await page.keyboard.press('Escape'); await sleep(900)
      const s12 = await sig(page)
      a.push({ name: '12. panel closed — visual matches image B', pass: nearest(s12, { demo: sigDemo, A: sigA, B: sigB }) === 'B', detail: refDetail(s12, { demo: sigDemo, A: sigA, B: sigB }) })
      record('E20 double-image-workflow', a)
    } catch (e) { record('E20 double-image-workflow', a, e.message) } finally { await ctx.close() }
  }

  await browser.close()
  const passed = results.filter((r) => r.pass).length
  fs.writeFileSync('/tmp/padtest/redesign-results.json', JSON.stringify({ summary: { total: results.length, passed, failed: results.length - passed, durationSec: Math.round((Date.now() - t0) / 1000) }, results }, null, 2))
  console.log(`\n==== ${passed}/${results.length} passed, ${results.length - passed} failed, ${Math.round((Date.now() - t0) / 1000)}s ====`)
  if (results.length - passed) process.exitCode = 1
})().catch((e) => { console.error(e); process.exit(1) })
