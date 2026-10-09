import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readIndexingMeta } from '../../utils/indexing.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return htmlFiles(absolute)
    return entry.isFile() && /\.html?$/i.test(entry.name) ? [absolute] : []
  }))
  return files.flat()
}

function checkMetadata(metadata, label) {
  assert.ok(metadata.some(meta => meta.name.toLowerCase() === 'robots'), `${label}: generic robots metadata is present in the head`)
  for (const meta of metadata) {
    const directives = meta.content.toLowerCase().split(/[\s,]+/).filter(Boolean)
    assert.ok(directives.includes('noindex'), `${label}: ${meta.name} prevents indexing`)
    for (const directive of ['index', 'all', 'indexifembedded'])
      assert.ok(!directives.includes(directive), `${label}: ${meta.name} does not contain ${directive}`)
  }
}

export async function checkIndexing(directory = '_site') {
  const output = path.resolve(root, directory)
  const files = (await htmlFiles(output)).sort()
  assert.ok(files.length > 0, `${output}: HTML pages exist`)
  let botMetaChecked = 0
  for (const file of files) {
    // The directive syntax is ASCII. Decoding one byte per character also
    // handles older student pages without assuming their text encoding.
    const source = (await readFile(file)).toString('latin1')
    const metadata = readIndexingMeta(source)
    checkMetadata(metadata, path.relative(output, file))
    botMetaChecked += metadata.length
  }
  return { output, pagesChecked: files.length, botMetaChecked }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await checkIndexing(process.argv[2]), null, 2))
