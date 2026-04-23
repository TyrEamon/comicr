import {
  cleanTitle,
  mapLimit,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from '../downloadPlan'
import { downloadSiteSettings } from '../downloadSiteSettings'
import { nativeHttpService } from '../nativeHttpService'

const EHENTAI_HOSTS = new Set(['e-hentai.org', 'exhentai.org'])

export function isEhentaiUrl(value: string) {
  try {
    const url = new URL(value)
    return EHENTAI_HOSTS.has(url.hostname.toLowerCase()) && /^\/g\/[^/]+\/[^/]+\/?/i.test(url.pathname)
  } catch {
    return false
  }
}

export async function resolveEhentaiDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const headers = headersForGallery(pageUrl)
  const firstHtml = await nativeHttpService.getText(pageUrl, headers)
  const firstDocument = parseHtml(firstHtml)
  const title = cleanTitle(firstDocument.querySelector('#gn')?.textContent || '', 'EHentai')
  const galleryPageUrls = collectGalleryPageUrls(firstDocument, pageUrl)
  const pageHtmls = await mapLimit(galleryPageUrls, 5, async (url, index) => (
    index === 0 ? firstHtml : nativeHttpService.getText(url, headers)
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
    const realPageUrl = await resolveRealPageUrl(link.url, headers)
    const imageUrl = await resolveFinalImageUrl(realPageUrl, headers)
    return {
      url: imageUrl,
      name: `${link.pageIndex}_${link.linkIndex}.jpg`,
      referer: realPageUrl,
      headers,
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
  const urls = new Set([pageUrl])
  const pageLinks = Array.from(document.querySelectorAll('.ptt a, table.ptt a, .gtb a'))

  for (const link of pageLinks) {
    const href = link.getAttribute('href')
    const url = href ? resolveUrl(href, pageUrl) : ''
    if (url) urls.add(url)
  }

  const pageCount = galleryPageCount(document)
  if (pageCount > 1) {
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      urls.add(galleryPageUrl(pageUrl, pageIndex))
    }
  }

  return Array.from(urls)
}

function galleryPageUrl(pageUrl: string, pageIndex: number) {
  const url = new URL(pageUrl)
  if (pageIndex <= 0) {
    url.searchParams.delete('p')
  } else {
    url.searchParams.set('p', String(pageIndex))
  }
  return url.toString()
}

function galleryPageCount(document: Document) {
  const text = document.body.textContent || ''
  const total = text.match(/Showing\s+\d+\s*-\s*\d+\s+of\s+(\d+)\s+images/i)?.[1]
  if (total) {
    return Math.ceil(Number(total) / 20)
  }

  const pageNumbers = Array.from(document.querySelectorAll('.ptt td, table.ptt td, .gtb td'))
    .map((node) => Number(node.textContent?.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)

  return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1
}

function collectImagePageLinks(document: Document, pageUrl: string) {
  return Array.from(document.querySelectorAll('#gdt > a'))
    .map((link) => resolveUrl(link.getAttribute('href') || '', pageUrl))
    .filter(Boolean)
}

async function resolveRealPageUrl(link: string, headers: Record<string, string>) {
  const html = await nativeHttpService.getText(link, headers)
  const image = parseHtml(html).querySelector('#img')
  const onError = image?.getAttribute('onerror') || ''
  const nl = onError.match(/nl\('(.+)'\)/)?.[1]
  if (!nl) {
    throw new Error('无法解析 EHentai 图片 nl 参数')
  }
  return `${link}?nl=${encodeURIComponent(nl)}`
}

async function resolveFinalImageUrl(realPageUrl: string, headers: Record<string, string>) {
  const html = await nativeHttpService.getText(realPageUrl, headers)
  const imageUrl = parseHtml(html).querySelector('#img')?.getAttribute('src') || ''
  if (!imageUrl) {
    throw new Error('无法解析 EHentai 图片地址')
  }
  return imageUrl
}

function headersForGallery(pageUrl: string) {
  const url = new URL(pageUrl)
  const cookieParts = ['nw=1']
  if (url.hostname.toLowerCase() === 'exhentai.org') {
    const cookie = downloadSiteSettings.getSettings().exhentaiCookie
    if (cookie) cookieParts.push(cookie)
  }
  return { Cookie: cookieParts.join('; ') }
}
