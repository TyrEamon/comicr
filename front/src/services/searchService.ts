import * as OpenCC from 'opencc-js/t2cn'

const traditionalToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' })
const hongKongToSimplified = OpenCC.Converter({ from: 'hk', to: 'cn' })

function normalizeChinese(value: string) {
  const folded = value.normalize('NFKC').toLocaleLowerCase()
  return hongKongToSimplified(traditionalToSimplified(folded))
}

function compactSearchText(value: string) {
  return normalizeChinese(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function searchTerms(query: string) {
  const normalized = normalizeChinese(query)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

  if (!normalized) return []

  const terms = normalized.split(/\s+/).filter(Boolean)
  return [...new Set(terms.map(compactSearchText).filter(Boolean))]
}

export const searchService = {
  matchesText(text: string, query: string) {
    const terms = searchTerms(query)
    if (terms.length === 0) return true

    const haystack = compactSearchText(text)
    return terms.every((term) => haystack.includes(term))
  },
}
