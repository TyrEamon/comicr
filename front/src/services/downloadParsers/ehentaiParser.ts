import {
  cleanTitle,
  mapLimit,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from '../downloadPlan'
import { nativeHttpService } from '../nativeHttpService'

const EHENTAI_HOSTS = new Set(['e-hentai.org', 'exhentai.org'])
const EHENTAI_HEADERS = { Cookie: 'nw=1' }

export function isEhentaiUrl(value: string) {
  try {
    const url = new URL(value)
    return EHENTAI_HOSTS.has(url.hostname.toLowerCase()) && /^\/g\/[^/]+\/[^/]+\/?/i.test(url.pathname)
  } catch {
    return false
  }
}

export async function resolveEhentaiDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const firstHtml = await nativeHttpService.getText(pageUrl, EHENTAI_HEADERS)
  const firstDocument = parseHtml(firstHtml)
  const title = cleanTitle(firstDocument.querySelector('#gn')?.textContent || '', 'EHentai')
  const galleryPageUrls = collectGalleryPageUrls(firstDocument, pageUrl)
  const pageHtmls = await mapLimit(galleryPageUrls, 5, async (url, index) => (
    index === 0 ? firstHtml : nativeHttpService.getText(url, EHENTAI_HEADERS)
  ))

  const imagePageLinks = pageHtmls.flatMap((html, pageIndex) => (
    collectImagePageLinks(parseHtml(html), galleryPageUrls[pageIndex]).map((url, linkIndex) => ({
      url,
      pageIndex,
      linkIndex,
    }))
  ))

  if (imagePageLinks.length === 0) {
    throw new Error('EHentai 页面里没有找到图片入口')
  }

  const pages = await mapLimit(imagePageLinks, 5, async (link) => {
    const realPageUrl = await resolveRealPageUrl(link.url)
    const imageUrl = await resolveFinalImageUrl(realPageUrl)
    return {
      url: imageUrl,
      name: `${link.pageIndex}_${link.linkIndex}.jpg`,
      referer: realPageUrl,
      headers: EHENTAI_HEADERS,
    }
  })

  return {
    source: pageUrl.includes('exhentai.org') ? 'exhentai' : 'ehentai',
    title,
    pageUrl,
    pages,
  }
}

function parseHtml(html: string) {
  return new DOMParser().parseFromString(html, 'text/html')
}

function collectGalleryPageUrls(document: Document, pageUrl: string) {
  const urls = [pageUrl]
  const cells = Array.from(document.querySelectorAll('body > .gtb:first-of-type td'))
  const lastIndex = cells.length - 1

  for (const [index, cell] of cells.entries()) {
    if (index === 0 || index === 1 || index === lastIndex) continue
    const href = cell.querySelector('a')?.getAttribute('href')
    const url = href ? resolveUrl(href, pageUrl) : ''
    if (url && !urls.includes(url)) urls.push(url)
  }

  return urls
}

function collectImagePageLinks(document: Document, pageUrl: string) {
  return Array.from(document.querySelectorAll('#gdt > a'))
    .map((link) => resolveUrl(link.getAttribute('href') || '', pageUrl))
    .filter(Boolean)
}

async function resolveRealPageUrl(link: string) {
  const html = await nativeHttpService.getText(link, EHENTAI_HEADERS)
  const image = parseHtml(html).querySelector('#img')
  const onError = image?.getAttribute('onerror') || ''
  const nl = onError.match(/nl\('(.+)'\)/)?.[1]
  if (!nl) {
    throw new Error('无法解析 EHentai 图片 nl 参数')
  }
  return `${link}?nl=${encodeURIComponent(nl)}`
}

async function resolveFinalImageUrl(realPageUrl: string) {
  const html = await nativeHttpService.getText(realPageUrl, EHENTAI_HEADERS)
  const imageUrl = parseHtml(html).querySelector('#img')?.getAttribute('src') || ''
  if (!imageUrl) {
    throw new Error('无法解析 EHentai 图片地址')
  }
  return imageUrl
}
