import { chromium } from 'playwright-chromium'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)
const root = path.resolve('a.a.2025_2026')
const sites = ['aroma', 'dinecraft', 'dish-ki', 'eden-leaf', 'krusty-krab', 'mise-en-thropic', 'riff']
const baseUrl = 'http://127.0.0.1:8877/a.a.2025_2026'
const directory = await mkdtemp(path.join(os.tmpdir(), 'cvedi-screenshots-'))
const browser = await chromium.launch({ headless: true })

try {
  for (const site of sites) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 878 }, deviceScaleFactor: 1 })
    const response = await page.goto(`${baseUrl}/${site}/`, { waitUntil: 'commit', timeout: 15000 })
    if (response?.status() !== 200) throw new Error(`${site}: homepage did not load`)
    await page.waitForTimeout(3000)
    await page.evaluate(() => Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]))
    const source = path.join(directory, `${site}.png`)
    const target = path.join(root, site, 'screenshot.webp')
    await page.screenshot({ path: source, type: 'png', animations: 'disabled' })
    await run('cwebp', ['-quiet', '-q', '88', '-m', '6', '-resize', '800', '0', source, '-o', target])
    console.log(`${site}: ${target}`)
    await page.close()
  }
} finally {
  await browser.close()
  await rm(directory, { recursive: true, force: true })
}
