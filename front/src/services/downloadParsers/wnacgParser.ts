import {
  cleanTitle,
  mapLimit,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from '../downloadPlan'
import { nativeHttpService } from '../nativeHttpService'

const WNACG_BASE_URL = 'https://www.wnacg.com'

export function isWnacgUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().includes('wnacg.com')
  } catch {
    return false
  }
}

export async function resolveWnacgDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const firstHtml = await nativeHttpService.getText(pageUrl)
  const firstDocument = parseHtml(firstHtml)
  const title = cleanTitle(firstDocument.querySelector('#bodywrap > h2')?.textContent || '', 'WNACG')
  const galleryPages = collectGalleryPages(firstDocument, pageUrl)

  const mangaLinksByPage = await mapLimit(galleryPages, 4, async (url, pageIndex) => {
    const document = pageIndex === 0 ? firstDocument : parseHtml(await nativeHttpService.getText(url))
    return collectMangaLinks(document, url).map((link, linkIndex) => ({
      url: link,
      pageIndex,
      linkIndex,
    }))
  })

  const mangaLinks = mangaLinksByPage.flat()
  if (mangaLinks.length === 0) {
    throw new Error('WNACG 页面里没有找到漫画图片页')
  }

  const pages = await mapLimit(mangaLinks, 6, async (link) => ({
    url: await resolveImageUrl(link.url),
    name: `${link.pageIndex}_${link.linkIndex}.jpg`,
    referer: link.url,
  }))

  return {
    source: 'wnacg',
    title,
    pageUrl,
    pages,
  }
}

function parseHtml(html: string) {
  return new DOMParser().parseFromString(html, 'text/html')
}

function collectGalleryPages(document: Document, pageUrl: string) {
  const urls = [pageUrl]
  for (const link of Array.from(document.querySelectorAll('.paginator a'))) {
    const url = absolutize(link.getAttribute('href') || '', pageUrl)
    if (url && !urls.includes(url)) urls.push(url)
  }
  return urls
}

function collectMangaLinks(document: Document, pageUrl: string) {
  return Array.from(document.querySelectorAll('#bodywrap ul li a'))
    .map((link) => absolutize(link.getAttribute('href') || '', pageUrl))
    .filter(Boolean)
}

async function resolveImageUrl(pageUrl: string) {
  const html = await nativeHttpService.getText(pageUrl)
  const src = parseHtml(html).querySelector('#picarea')?.getAttribute('src') || ''
  const imageUrl = absolutize(src, pageUrl)
  if (!imageUrl) {
    throw new Error('无法解析 WNACG 图片地址')
  }
  return imageUrl
}

function absolutize(value: string, baseUrl: string) {
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${WNACG_BASE_URL}${value}`
  return resolveUrl(value, baseUrl)
}
