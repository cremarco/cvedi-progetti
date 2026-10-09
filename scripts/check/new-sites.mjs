import { chromium } from 'playwright-chromium'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const yearDirectory = path.resolve(process.argv[2] || 'a.a.2025_2026')
const reportPath = path.resolve(process.argv[3] || 'reports/archive-pages.json')
const baseUrl = process.argv[4] || 'http://127.0.0.1:8877'

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return htmlFiles(absolute)
    return entry.isFile() && /\.html?$/i.test(entry.name) ? [absolute] : []
  }))
  return nested.flat()
}

const pages = (await htmlFiles(yearDirectory)).sort()
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 878 } })
const results = []
let next = 0

async function worker() {
  while (next < pages.length) {
    const file = pages[next++]
    const relative = path.relative(path.dirname(yearDirectory), file).split(path.sep).join('/')
    const url = `${baseUrl}/${relative}`
    const page = await context.newPage()
    const errors = new Set()
    page.on('response', response => {
      if (response.url().startsWith(`${baseUrl}/`) && response.status() >= 400) {
        errors.add(`${response.status()} ${decodeURI(response.url())}`)
      }
    })
    let status = 0
    let error = ''
    try {
      const response = await page.goto(url, { waitUntil: 'commit', timeout: 15000 })
      status = response?.status() || 0
      // External CDN scripts can delay DOMContentLoaded despite a successful
      // local document response. Keep that delay separate from HTTP failures.
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
    } catch (exception) {
      error = exception.message
    }
    results.push({ file: relative, status, error, localErrors: [...errors].sort() })
    await page.close()
  }
}

await Promise.all(Array.from({ length: 4 }, worker))
await browser.close()
results.sort((a, b) => a.file.localeCompare(b.file))
await writeFile(reportPath, `${JSON.stringify(results, null, 2)}\n`)
const unique = new Set(results.flatMap(result => result.localErrors))
console.log(`Pages: ${results.length}; non-200 pages: ${results.filter(result => result.status !== 200).length}; local HTTP errors: ${unique.size}`)
for (const value of [...unique].slice(0, 60)) console.log(value)
