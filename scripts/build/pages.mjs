import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preventSiteIndexing } from './noindex.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const output = path.join(root, '_site')
const base = process.env.PAGES_BASE || '/cvedi-progetti/'
if (!/^\/(?:[^?#\s]+\/)?$/.test(base)) throw new Error('PAGES_BASE must start and end with /')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const entries = await readdir(root, { withFileTypes: true })
for (const entry of entries) {
  if (!/^a\.a\.\d{4}_\d{4}$/.test(entry.name) && !['fonts', 'archive-photo-unavailable.svg', 'gallery-data.json', 'gallery.css', 'gallery.js', 'index.html', 'link-notice.js', 'totem-entry.js', 'totem.css', 'totem.html', 'totem.js'].includes(entry.name)) continue
  await cp(path.join(root, entry.name), path.join(output, entry.name), {
    recursive: true,
    filter: source => !['.ds_store', 'desktop.ini', 'thumbs.db', '.git', 'node_modules', '__pycache__'].includes(path.basename(source).toLowerCase()) && !path.basename(source).startsWith('._'),
  })
}
// Adapt archive-root navigation only in publication copies; preserve originals.
async function prefixArchiveURLs(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) await prefixArchiveURLs(location)
    else if (/\.(?:html|htm|css|js)$/i.test(entry.name)) {
      const original = await readFile(location)
      const updated = Buffer.from(original.toString('latin1').replace(/(?<![\w./-])\/a\.a\./g, `${base}a.a.`), 'latin1')
      if (!original.equals(updated)) await writeFile(location, updated)
    }
  }
}
await prefixArchiveURLs(output)
await preventSiteIndexing(output)
await writeFile(path.join(output, '.nojekyll'), '')
const revision = process.env.GITHUB_SHA || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ commit: revision, base }, null, 2) + '\n')
async function measure(directory) {
  let bytes = 0, files = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) { const child = await measure(location); bytes += child.bytes; files += child.files }
    else if (entry.isFile()) { bytes += (await stat(location)).size; files++ }
    else throw new Error(`Unsupported Pages entry: ${location}`)
  }
  return { bytes, files }
}
const size = await measure(output)
console.log(`Pages archive: ${size.files} files, ${(size.bytes / 1e6).toFixed(2)} MB`)
if (size.bytes > 990_000_000) throw new Error('The published archive exceeds the 990 MB deployment budget')
