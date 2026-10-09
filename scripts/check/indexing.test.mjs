import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { preventIndexingHTML, readIndexingMeta } from '../../utils/indexing.mjs'
import { checkIndexing } from './indexing.mjs'

function normalizedMetadata(source) {
  return readIndexingMeta(source).map(meta => ({
    name: meta.name.toLowerCase(),
    directives: meta.content.toLowerCase().split(/[\s,]+/).filter(Boolean).sort(),
  }))
}

function expectedMetadata(name, directives) {
  return { name, directives: [...directives].sort() }
}

function assertIdempotent(source) {
  const result = preventIndexingHTML(source)
  assert.equal(preventIndexingHTML(result), result, 'a second build makes no further changes')
  return result
}

test('adds a generic directive while preserving head attributes, body and Unicode', () => {
  const opening = `<HEAD data-theme="night" lang='it'>`
  const title = '<title>Un caffè ☕ — è già pronto</title>'
  const body = '<body class="archive"><p>Attribuzione: © Studente; λ 🎨</p></body></html>'
  const source = `<!doctype html>\r\n<html lang="it">${opening}${title}</HEAD>${body}`
  const result = assertIdempotent(source)
  assert.ok(result.includes(opening), 'the original head opening tag is retained verbatim')
  assert.ok(result.includes(title), 'title and Unicode text are retained verbatim')
  assert.ok(result.endsWith(body), 'the complete original body is retained verbatim')
  assert.deepEqual(normalizedMetadata(result), [expectedMetadata('robots', ['noindex'])])
})

test('normalizes unquoted, reversed and mixed-case indexing metadata', () => {
  const source = '<html><head><meta content=INDEX name=robots><META CONTENT=\'ALL, FOLLOW\' NAME=ROBOTS data-owner="student"><meta name="bingbot" content=ALL /></head><body>Original content</body></html>'
  const result = assertIdempotent(source)
  assert.deepEqual(normalizedMetadata(result), [
    expectedMetadata('robots', ['noindex']),
    expectedMetadata('robots', ['noindex', 'follow']),
    expectedMetadata('bingbot', ['noindex']),
  ])
  assert.ok(result.includes('data-owner="student"'), 'unrelated metadata attributes are retained')
  assert.ok(result.endsWith('<body>Original content</body></html>'))
})

test('normalizes whitespace-separated directives and adds missing content attributes', () => {
  const source = '<head><meta name="robots" content="INDEX FOLLOW noarchive"><meta name="googlebot"><meta name="bingbot" content="noindex indexifembedded nosnippet"></head><body>Original content</body>'
  const result = assertIdempotent(source)
  assert.deepEqual(normalizedMetadata(result), [
    expectedMetadata('robots', ['noindex', 'follow', 'noarchive']),
    expectedMetadata('googlebot', ['noindex']),
    expectedMetadata('bingbot', ['noindex', 'nosnippet']),
  ])
})

test('changes the content attribute without changing similarly named attributes', () => {
  const source = '<head><meta data-content="index demo" name="robots" content="index"></head><body>Original content</body>'
  const result = assertIdempotent(source)
  assert.equal(result, '<head><meta data-content="index demo" name="robots" content="noindex"></head><body>Original content</body>')
  assert.ok(result.includes('data-content="index demo"'))
  assert.deepEqual(normalizedMetadata(result), [expectedMetadata('robots', ['noindex'])])
})

test('normalization only replaces the existing indexing attribute', () => {
  const source = '<!doctype html><html lang=it><head data-archive="2005"><meta name=robots content=index data-id=3></head>\r\n<body>Età, © Studente</body></html>'
  const expected = '<!doctype html><html lang=it><head data-archive="2005"><meta name=robots content="noindex" data-id=3></head>\r\n<body>Età, © Studente</body></html>'
  assert.equal(assertIdempotent(source), expected)
})

test('normalizes every supported crawler override and keeps restrictive directives', () => {
  const crawlerNames = ['googlebot', 'googlebot-news', 'bingbot', 'msnbot', 'msnbot-media', 'duckduckbot', 'slurp', 'yandex', 'yandexbot', 'yandex-images', 'baiduspider', 'ia_archiver']
  const source = `<head>${crawlerNames.map(name => `<meta name="${name}" content="index, indexifembedded, all, noarchive, nofollow, nosnippet, max-snippet:-1">`).join('')}</head><body>Archive attribution</body>`
  const result = assertIdempotent(source)
  const metadata = normalizedMetadata(result)
  assert.equal(metadata.filter(meta => meta.name === 'robots').length, 1)
  for (const name of crawlerNames)
    assert.deepEqual(metadata.find(meta => meta.name === name), expectedMetadata(name, ['noindex', 'noarchive', 'nofollow', 'nosnippet', 'max-snippet:-1']), name)
  assert.equal(metadata.length, crawlerNames.length + 1)
  assert.ok(result.endsWith('<body>Archive attribution</body>'))
})

test('already restrictive pages are exactly unchanged', () => {
  const source = `<!DOCTYPE html>\r\n<html><head data-original='yes'><meta NAME='ROBOTS' content='noindex, noarchive'><meta name="googlebot" content="noindex, nofollow, nosnippet"></head><body>È così.</body></html>`
  assert.equal(assertIdempotent(source), source)
  assert.deepEqual(normalizedMetadata(source), [
    expectedMetadata('robots', ['noindex', 'noarchive']),
    expectedMetadata('googlebot', ['noindex', 'nofollow', 'nosnippet']),
  ])
})

test('removes conflicting directives even when noindex is already present', () => {
  const source = '<head><meta name="robots" content="noindex, INDEX, ALL, indexifembedded, noarchive"></head><body>Preserve me.</body>'
  const result = assertIdempotent(source)
  assert.deepEqual(normalizedMetadata(result), [expectedMetadata('robots', ['noindex', 'noarchive'])])
  assert.ok(result.endsWith('<body>Preserve me.</body>'))
})

test('fake heads and metadata in comments, scripts, styles and the body remain untouched', () => {
  const comment = '<!-- <head><meta name="robots" content="index"></head> -->'
  const script = `<script>const sample = '<head><meta name="googlebot" content="index"></head>';</script>`
  const style = `<style>/* <head><meta name="bingbot" content="index"></head> */</style>`
  const body = '<body><pre>&lt;head&gt;</pre><meta name="robots" content="index"><script>const html = "<head>";</script></body></html>'
  const source = `<!doctype html>${comment}<html><head>${script}${style}<title>Archive</title></head>${body}`
  assert.deepEqual(readIndexingMeta(source), [], 'source examples are not actual head metadata')
  const result = assertIdempotent(source)
  assert.deepEqual(normalizedMetadata(result), [expectedMetadata('robots', ['noindex'])])
  for (const fragment of [comment, script, style]) assert.ok(result.includes(fragment), fragment)
  assert.ok(result.endsWith(body), 'body metadata and examples retain their original bytes')
})

test('reader exposes only actual head crawler metadata', () => {
  const source = '<!-- <meta name="robots" content="index"> --><html><head><meta name="description" content="robots index"><meta name="robots" content="noindex"><script>const sample = \'<meta name="googlebot" content="index">\';</script><style>/* <meta name="bingbot" content="index"> */</style></head><body><meta name="googlebot" content="index"></body></html>'
  assert.deepEqual(normalizedMetadata(source), [expectedMetadata('robots', ['noindex'])])
})

test('adds a real head to empty, headless and implicitly headed documents', async t => {
  const fixtures = [
    { name: 'empty', source: '' },
    { name: 'body only', source: '<body><h1>Archivio</h1><p>Contenuto e attribuzione.</p></body>', body: '<body><h1>Archivio</h1><p>Contenuto e attribuzione.</p></body>' },
    { name: 'no head', source: '<!doctype html><html lang="it"><body><p>Contenuto</p></body></html>', body: '<body><p>Contenuto</p></body></html>' },
    { name: 'implicit head', source: '<!doctype html><html><title>Implicit archive title</title><meta name="robots" content="index"><body>Original archive body</body></html>', title: '<title>Implicit archive title</title>', body: '<body>Original archive body</body></html>' },
  ]
  for (const fixture of fixtures) await t.test(fixture.name, () => {
    const result = assertIdempotent(fixture.source)
    assert.match(result, /<head(?:\s[^>]*)?>/i, 'a real head opening tag exists')
    assert.match(result, /<\/head\s*>/i, 'a real head closing tag exists')
    const metadata = normalizedMetadata(result)
    assert.ok(metadata.some(meta => meta.name === 'robots'))
    for (const meta of metadata) {
      assert.ok(meta.directives.includes('noindex'))
      assert.ok(!meta.directives.some(directive => ['index', 'all', 'indexifembedded'].includes(directive)))
    }
    if (fixture.title) assert.ok(result.includes(fixture.title))
    if (fixture.body) assert.ok(result.endsWith(fixture.body))
    if (fixture.name === 'implicit head') assert.ok(!result.slice(0, result.indexOf('<body>')).includes('content="index"'), 'implicit original metadata is normalized along with the new head')
  })
})

test('the byte-preserving interface retains UTF-8 and legacy archive bodies', async t => {
  const bodies = [
    { name: 'UTF-8', bytes: Buffer.from('<body><p>È già pronto — café ☕ 🎨</p></body></html>', 'utf8') },
    { name: 'Windows-1252', bytes: Buffer.concat([Buffer.from('<body><p>Caf'), Buffer.from([0xe9, 0x20, 0x80, 0x20, 0x93, 0x41, 0x94]), Buffer.from('</p></body></html>')]) },
  ]
  for (const fixture of bodies) await t.test(fixture.name, () => {
    const source = Buffer.concat([Buffer.from('<html><head><title>Archive</title></head>'), fixture.bytes])
    const result = Buffer.from(assertIdempotent(source.toString('latin1')), 'latin1')
    assert.deepEqual(result.subarray(result.indexOf('<body>')), fixture.bytes, 'non-ASCII original bytes are unchanged')
    assert.deepEqual(normalizedMetadata(result.toString('latin1')), [expectedMetadata('robots', ['noindex'])])
  })
})

test('publication checker visits nested .html and .htm pages regardless of extension case', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cvedi-indexing-check-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(path.join(directory, 'student', 'nested'), { recursive: true })
  const page = '<head><meta name="robots" content="noindex"></head><body>Original</body>'
  await Promise.all([
    writeFile(path.join(directory, 'index.html'), page),
    writeFile(path.join(directory, 'student', 'legacy.HTM'), page),
    writeFile(path.join(directory, 'student', 'nested', 'details.HTML'), page),
    writeFile(path.join(directory, 'student', 'style.css'), '/* not an HTML page */'),
  ])
  assert.deepEqual(await checkIndexing(directory), { output: directory, pagesChecked: 3, botMetaChecked: 3 })
})

test('publication checker rejects absent metadata and crawler overrides that allow indexing', async t => {
  const fixtures = [
    ['missing', '<head><title>Archive</title></head><body>Original</body>', /generic robots/],
    ['comment only', '<head><!-- <meta name="robots" content="noindex"> --></head><body>Original</body>', /generic robots/],
    ['body only', '<head><title>Archive</title></head><body><meta name="robots" content="noindex"></body>', /generic robots/],
    ['crawler override', '<head><meta name="robots" content="noindex"><meta name="googlebot" content="index"></head><body>Original</body>', /googlebot prevents indexing/],
    ['conflict', '<head><meta name="robots" content="noindex, indexifembedded"></head><body>Original</body>', /does not contain indexifembedded/],
  ]
  for (const [name, source, expected] of fixtures) await t.test(name, async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cvedi-indexing-invalid-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    await writeFile(path.join(directory, 'index.html'), source)
    await assert.rejects(checkIndexing(directory), expected)
  })
})
