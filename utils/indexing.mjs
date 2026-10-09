const robotName = /^(?:robots|googlebot(?:-[\w-]+)?|bingbot|msnbot(?:-[\w-]+)?|duckduckbot|slurp|yandex(?:bot)?(?:-[\w-]+)?|baiduspider|ia_archiver)$/i
const metaTag = '<meta name="robots" content="noindex">'

// Keep byte offsets and original markup; a DOM reserialization would rewrite
// legacy student pages. Comments and raw-text elements are not HTML tags.
function markupTokens(html) {
  return [...html.matchAll(/<!--[\s\S]*?-->|<(script|style|textarea|title|xmp|iframe|noembed|noframes)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)]
}
function tokens(html) {
  return markupTokens(html).filter(match => !/^<!--|^<(?:script|style|textarea|title|xmp|iframe|noembed|noframes)\b/i.test(match[0]))
}

function attributes(tag) {
  const result = {}
  for (const match of tag.replace(/^<[\w:-]+|\/?>$/g, '').matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    result[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? '').replace(/\/$/, '')
  return result
}

function head(html) {
  const tags = tokens(html)
  const opening = tags.findIndex(match => /^<head\b/i.test(match[0]))
  if (opening < 0) return { tags: [], opening: null }
  const end = tags.slice(opening + 1).findIndex(match => /^<\/head\s*>|^<body\b|^<\/html\s*>/i.test(match[0]))
  return {
    opening: tags[opening],
    tags: tags.slice(opening + 1, end < 0 ? undefined : opening + 1 + end),
  }
}

export function readIndexingMeta(html) {
  return head(html).tags.filter(match => /^<meta\b/i.test(match[0])).map(match => attributes(match[0]))
    .filter(attributes => robotName.test(attributes.name || ''))
    .map(({ name, content = '' }) => ({ name: name.toLowerCase(), content }))
}

export function preventIndexingHTML(html) {
  const documentHead = head(html)
  if (!documentHead.opening) {
    const htmlTag = tokens(html).find(match => /^<html\b/i.test(match[0]))
    const declaration = html.match(/^(?:\uFEFF|\xEF\xBB\xBF)?\s*<!doctype\b[^>]*>/i)
    const offset = htmlTag ? htmlTag.index + htmlTag[0].length
      : declaration ? declaration[0].length
        : html.startsWith('\uFEFF') ? 1 : html.startsWith('\xEF\xBB\xBF') ? 3 : 0
    // Wrap implicit metadata too: browsers put title/meta before body into head,
    // even if an earlier injected head was already closed.
    let end = offset
    for (const match of markupTokens(html).filter(match => match.index >= offset)) {
      if (html.slice(end, match.index).trim()) break
      if (!/^<!--|^<(?:base|basefont|bgsound|link|meta|title|script|style)\b/i.test(match[0])) break
      end = match.index + match[0].length
    }
    const wrapped = html.slice(0, offset) + '<head>' + html.slice(offset, end) + '</head>' + html.slice(end)
    return preventIndexingHTML(wrapped)
  }
  const edits = []
  let generic = false
  for (const match of documentHead.tags) {
    if (!/^<meta\b/i.test(match[0])) continue
    const attr = attributes(match[0])
    if (!robotName.test(attr.name || '')) continue
    if (attr.name.toLowerCase() === 'robots') generic = true
    const directives = (attr.content || '').split(/[,\s]+/).filter(Boolean)
    const conflicts = /^(?:index|all|indexifembedded)$/i
    if (directives.some(value => /^noindex$/i.test(value)) && !directives.some(value => conflicts.test(value))) continue
    const remaining = (attr.content || '').replace(/(^|[,\s])(?:index|all|indexifembedded|noindex)(?=$|[,\s])/gi, '$1')
      .replace(/^\s*,+|,+\s*$/g, '').replace(/,\s*,/g, ',').trim()
    const content = ('noindex' + (remaining ? ', ' + remaining : '')).replace(/"/g, '&quot;')
    const updated = /\scontent\s*=/i.test(match[0])
      ? match[0].replace(/\scontent\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ' content="' + content + '"')
      : match[0].replace(/\/?>$/, ' content="' + content + '">')
    edits.push({ start: match.index, end: match.index + match[0].length, value: updated })
  }
  if (!generic) {
    // Leave an early charset declaration at the front of the head.
    const charset = documentHead.tags.find(match => /^<meta\b/i.test(match[0]) && /\bcharset\s*=/i.test(match[0]))
    const offset = charset ? charset.index + charset[0].length : documentHead.opening.index + documentHead.opening[0].length
    edits.push({ start: offset, end: offset, value: '\n  ' + metaTag })
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    html = html.slice(0, edit.start) + edit.value + html.slice(edit.end)
  return html
}
