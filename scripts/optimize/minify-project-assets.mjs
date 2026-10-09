import { createRequire } from 'node:module'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Install the pinned tools outside the website archive; no runtime dependency
// is added to the sites. JavaScript compression and mangling stay disabled.
const require = createRequire(`${process.env.CVEDI_MINIFIER_DIR || '/tmp/cvedi-minify-runtime'}/package.json`)
const { minify: minifyHtml } = require('html-minifier-terser')
const { minify: minifyJs } = require('terser')
const CleanCSS = require('clean-css')
const root = path.resolve(process.argv[2] || 'a.a.2025_2026')
const reports = path.resolve(process.argv[3] || 'reports/minification')
const backup = path.join(reports, 'before-minification')
const css = new CleanCSS({
  rebase: false,
  inline: ['none'],
  level: { 1: { all: false, removeWhitespace: true, specialComments: 'all', selectorsSortingMethod: 'none' }, 2: false },
})
const jsOptions = { compress: false, mangle: false, format: { comments: /^!|@preserve|@license|copyright/i, keep_quoted_props: true } }

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const lists = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(directory, entry.name))
    : [path.join(directory, entry.name)]))
  return lists.flat()
}
function minifyCss(source) {
  const result = css.minify(source)
  if (result.errors.length) throw new Error(result.errors.join('; '))
  return result.styles
}
const rows = ['status\told_bytes\tnew_bytes\tpath']
for (const file of (await files(root)).sort()) {
  const extension = path.extname(file).toLowerCase()
  if (!['.html', '.css', '.js', '.mjs'].includes(extension)) continue
  const source = await readFile(file, 'utf8')
  const relative = path.relative(root, file)
  try {
    let target
    if (extension === '.css') target = minifyCss(source)
    else if (extension === '.js' || extension === '.mjs') target = (await minifyJs(source, { ...jsOptions, module: extension === '.mjs' })).code
    else target = await minifyHtml(source, {
      collapseWhitespace: true,
      conservativeCollapse: true,
      removeComments: true,
      ignoreCustomComments: [/^!/, /@preserve|@license|copyright/i, /impeccable-/],
      removeAttributeQuotes: true,
      minifyCSS: minifyCss,
      minifyJS: async code => (await minifyJs(code, jsOptions)).code,
    })
    const oldBytes = Buffer.byteLength(source)
    const newBytes = Buffer.byteLength(target)
    if (newBytes >= oldBytes - 50) continue
    const saved = path.join(backup, relative)
    await mkdir(path.dirname(saved), { recursive: true })
    await writeFile(saved, source)
    await writeFile(file, target)
    rows.push(`minified\t${oldBytes}\t${newBytes}\t${relative}`)
  } catch (error) {
    rows.push(`skipped:${error.message.replace(/[\t\n]/g, ' ').slice(0, 120)}\t${Buffer.byteLength(source)}\t0\t${relative}`)
  }
}
await mkdir(reports, { recursive: true })
await writeFile(path.join(reports, 'new-year-minification.tsv'), `${rows.join('\n')}\n`)
const accepted = rows.slice(1).filter(row => row.startsWith('minified\t')).map(row => row.split('\t'))
console.log(`Minified ${accepted.length} files; saved ${accepted.reduce((sum, row) => sum + Number(row[1]) - Number(row[2]), 0)} bytes.`)
