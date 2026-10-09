import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { preventIndexingHTML } from '../../utils/indexing.mjs'
import { checkIndexing } from '../check/indexing.mjs'

/** Apply the policy only to generated publication copies, including archives. */
export async function preventSiteIndexing(directory) {
  let changed = 0
  async function visit(location) {
    for (const entry of await readdir(location, { withFileTypes: true })) {
      const file = path.join(location, entry.name)
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
        const original = await readFile(file)
        // Latin-1 is a reversible mapping of each byte, including UTF-8 input.
        const updated = Buffer.from(preventIndexingHTML(original.toString('latin1')), 'latin1')
        if (!original.equals(updated)) { await writeFile(file, updated); changed++ }
      }
    }
  }
  await visit(directory)
  const report = await checkIndexing(directory)
  console.log('Search indexing: ' + report.pagesChecked + ' HTML pages excluded (' + changed + ' updated).')
  return { ...report, changed }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await preventSiteIndexing(path.resolve(process.argv[2] || '_site'))
