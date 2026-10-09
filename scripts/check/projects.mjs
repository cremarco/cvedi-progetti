import assert from 'node:assert/strict'
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-chromium'

const archive = path.resolve('.')
const base = new URL(process.env.PROJECTS_URL || 'http://127.0.0.1:4174/cvedi-progetti/')
const output = path.resolve(process.env.PROJECTS_REPORT || 'reports/projects')
const allProjects = process.env.PROJECTS_ALL === '1'
const projects = JSON.parse(await readFile(path.join(archive, 'gallery-data.json'), 'utf8')).photos
  .filter(project => allProjects || ['2024-2025', '2025-2026'].includes(project['A.A.']))
const layoutPages = new Set(allProjects
  ? JSON.parse(await readFile(new URL('./fixtures/archive-layout-pages.json', import.meta.url), 'utf8'))
  : [])
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const recheck = process.env.PROJECTS_RECHECK === '1'
const previous = recheck ? JSON.parse(await readFile(path.join(output, 'verification.json'), 'utf8')) : null
const recheckPages = new Set([...layoutPages, ...(previous?.failures.map(failure => failure.label) || [])])
const results = { viewers: [], pages: previous ? previous.pages.filter(page => !recheckPages.has(page.file)) : [], failures: [] }
if (previous) results.recheck = { previousFailures: previous.failures.length, preservedPages: results.pages.length }
if (process.env.PROJECTS_SKIP_PAGES === '1') {
  results.pages = JSON.parse(await readFile(path.join(output, 'verification.json'), 'utf8')).pages
}

async function check(label, action) {
  try { await action() } catch (error) { results.failures.push({ label, error: error.message }) }
}

function projectPath(project) { return project.url.replace(/^\/+/, '') }

async function checkFit(page) {
  const fit = await page.evaluate(() => {
    const stage = document.querySelector('#totem-stage').getBoundingClientRect()
    const canvas = document.querySelector('#totem-canvas').getBoundingClientRect()
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      inside: canvas.left >= stage.left && canvas.right <= stage.right + 1
        && canvas.top >= stage.top && canvas.bottom <= stage.bottom + 1,
      width: canvas.width,
    }
  })
  assert.equal(fit.overflow, false, 'The viewer overflows horizontally')
  assert.equal(fit.inside, true, 'The fitted screen is cropped')
  return fit
}

async function navigate(app, selector, destination) {
  await Promise.all([
    app.waitForURL(url => url.pathname.endsWith(destination), { waitUntil: 'domcontentloaded' }),
    app.locator(selector).first().click(),
  ])
}

try {
  for (const project of projects.filter(project => project.screen)) {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await check(`${project.name} at ${viewport.width}px`, async () => {
        const page = await context.newPage()
        try {
          await page.setViewportSize(viewport)
          await page.goto(new URL(projectPath(project), base).href)
          await page.waitForFunction(() => document.querySelector('#totem-status').hidden)
          assert.equal(new URL(page.url()).searchParams.get('project'), projectPath(project),
            'A direct project link must open the fitted viewer')
          const app = page.frames().find(frame => frame !== page.mainFrame())
          assert.deepEqual(await app.evaluate(() => ({ width: innerWidth, height: innerHeight })),
            { width: project.screen.width, height: project.screen.height })
          const fit = await checkFit(page)
          await page.getByRole('button', { name: 'Ingrandisci', exact: true }).click()
          assert.equal(await page.locator('#totem-zoom').getAttribute('aria-pressed'), 'true')
          assert.ok(await page.locator('#totem-canvas').evaluate(e => e.getBoundingClientRect().width) > fit.width)
          await page.getByRole('button', { name: 'Adatta allo schermo', exact: true }).click()
          await checkFit(page)

          const site = projectPath(project).split('/').filter(Boolean).at(-1)
          if (site === 'AstroMed') await navigate(app, '.finger', 'index-home.html')
          if (site === 'AstroVeggie') {
            await navigate(app, 'img.image', '1_start-screen.html')
            await navigate(app, 'a[href="2_home.html"]', '2_home.html')
          }
          if (site === 'Progetto_CVeDI-consegna') await navigate(app, '.play.touch', 'index-home.html')
          if (site === 'Totem_Magrathea') await navigate(app, '.velurion', '1_pagina-home2.html')
          if (site === 'Xylos') await navigate(app, 'a[href="1_home.html"]', '1_home.html')
          if (site === 'nexus') {
            await app.locator('.standby').click()
            await app.locator('.center').click()
            await app.locator('.sb-button').first().click()
            await navigate(app, 'a[href="1_tickets.html"]', '1_tickets.html')
          }
          const destination = app.url()
          const relativePage = new URL(destination).pathname.split('/').at(-1)
          await page.waitForFunction(pageName => decodeURIComponent(location.hash.slice(1)) === pageName, relativePage)
          await page.reload()
          await page.waitForFunction(() => document.querySelector('#totem-status').hidden)
          assert.equal(page.frames().find(frame => frame !== page.mainFrame()).url(), destination,
            'Reload loses the page reached inside the totem')
          await checkFit(page)
          await page.setViewportSize({ width: 768, height: 1024 })
          await page.waitForTimeout(100)
          await checkFit(page)
          if (viewport.width === 1440) {
            const native = await context.newPage()
            try {
              await native.goto(await page.locator('#totem-original').getAttribute('href'))
              assert.equal(native.frames().length, 1, 'The original view redirects back to the viewer')
            } finally { await native.close() }
          }
          results.viewers.push({ project: project.name, viewport, destination, passed: true })
        } finally { await page.close() }
      })
    }
  }

  await check('Gallery links and filters', async () => {
    const page = await context.newPage()
    try {
      await page.goto(base.href)
      await page.locator('#filter-2024-2025').click()
      assert.equal(await page.locator('.project-link').count(), 7)
      assert.equal(await page.locator('.project-link[href*="totem.html"]').count(), 6)
      await page.locator('#filter-2025-2026').click()
      assert.equal(await page.locator('.project-link').count(), 7)
      assert.equal(await page.locator('.project-link[href*="totem.html"]').count(), 0)
      await page.goto(new URL('totem.html?project=missing', base).href)
      await page.getByRole('status').filter({ hasText: 'Impossibile aprire' }).waitFor()
      assert.equal(await page.locator('#totem-frame').getAttribute('src'), null)
    } finally { await page.close() }
  })

  async function htmlFiles(directory) {
    const files = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) files.push(...await htmlFiles(file))
      else if (/\.html?$/i.test(entry.name)) files.push(file)
    }
    return files
  }
  const files = []
  if (process.env.PROJECTS_SKIP_PAGES !== '1') {
    for (const project of projects) {
      const directory = projectPath(project).split('/').slice(0, 2).join('/')
      for (const file of await htmlFiles(path.join(archive, directory))) {
        if (!previous || recheckPages.has(path.relative(archive, file).split(path.sep).join('/'))) files.push({ project, file })
      }
    }
  }
  let next = 0, checked = 0
  async function worker() {
    while (next < files.length) {
      const { project, file } = files[next++]
      const relative = path.relative(archive, file).split(path.sep).join('/')
      const page = await context.newPage()
      const http = new Set(), failed = new Set(), scriptErrors = new Set(), expectedRequests = new Set()
      page.on('response', response => {
        if (response.url().startsWith(base.href) && response.status() >= 400) {
          const message = `${response.status()} ${decodeURI(response.url())}`
          // The free WebRotate runtime probes for an optional commercial license.
          // Its documented Basic mode remains functional when that file is absent.
          const optionalLicense = relative.startsWith('a.a.2022_2023/Cinergy/')
            && ['pages/1_Prodotto.html', 'assets/webrotate/Scarpa360_NEW.html'].some(file => relative.endsWith(file))
            && new URL(response.url()).pathname.endsWith('/license.lic')
          ;(optionalLicense ? expectedRequests : http).add(message)
        }
      })
      page.on('requestfailed', request => {
        if (request.url().startsWith(base.href) && request.failure()?.errorText !== 'net::ERR_ABORTED') failed.add(request.url())
      })
      page.on('pageerror', error => scriptErrors.add(error.message))
      await check(relative, async () => {
        try {
          const defaultSize = project.screen || (allProjects ? { width: 1280, height: 720 } : { width: 1440, height: 900 })
          const pageSize = project.screen?.pages?.[path.basename(file)] || defaultSize
          await page.setViewportSize({ width: pageSize.width, height: pageSize.height })
          const url = new URL(relative, base)
          if (project.screen) url.searchParams.set('original', '1')
          let response
          try { response = await page.goto(url.href, { waitUntil: 'domcontentloaded' }) }
          catch (error) {
            if (!/net::ERR_CONNECTION_RESET/.test(error.message)) throw error
            failed.clear()
            response = await page.goto(url.href, { waitUntil: 'domcontentloaded' })
          }
          assert.equal(response.status(), 200)
          await page.waitForTimeout(400)
          if (failed.size) {
            failed.clear()
            await page.reload({ waitUntil: 'domcontentloaded' })
            await page.waitForTimeout(400)
          }
          const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
          results.pages.push({ file: relative, status: response.status(), localErrors: [...http], expectedRequests: [...expectedRequests], failed: [...failed], scriptErrors: [...scriptErrors], layout })
          assert.equal(http.size, 0, [...http].join('\n'))
          assert.equal(failed.size, 0, [...failed].join('\n'))
          assert.equal(scriptErrors.size, 0, [...scriptErrors].join('\n'))
          if (layoutPages.has(relative)) assert.ok(layout.scrollWidth <= layout.width + 1,
            `Horizontal overflow: ${layout.scrollWidth - layout.width}px`)
        } finally { await page.close() }
      })
      if (++checked % 40 === 0) console.log(`Checked ${checked}/${files.length} pages`)
    }
  }
  await Promise.all([worker(), worker()])
} finally {
  await browser.close()
  await writeFile(path.join(output, 'verification.json'), `${JSON.stringify(results, null, 2)}\n`)
}
console.log(`${results.viewers.length} viewer checks; ${results.pages.length} HTML pages; ${results.failures.length} failures`)
for (const failure of results.failures) console.error(`${failure.label}: ${failure.error}`)
process.exitCode = results.failures.length ? 1 : 0
