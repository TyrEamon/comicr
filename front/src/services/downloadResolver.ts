import {
  cleanTitle,
  IMAGE_URL_RE,
  imageNameFromUrl,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from './downloadPlan'
import { isTelegraphUrl, resolveTelegraphDownloadPlan } from './downloadParsers/telegraphParser'

export async function resolveDownloadPlan(rawUrl: string): Promise<DownloadPlan> {
  const pageUrl = new URL(rawUrl).toString()

  if (isTelegraphUrl(pageUrl)) {
    return resolveTelegraphDownloadPlan(pageUrl)
  }

  if (IMAGE_URL_RE.test(pageUrl)) {
    return {
      source: 'link',
      title: imageNameFromUrl(pageUrl, 0).replace(/\.[^.]+$/, ''),
      pageUrl,
      pages: [{
        url: pageUrl,
        name: imageNameFromUrl(pageUrl, 0),
        referer: pageUrl,
      }],
    }
  }

  return resolveGenericHtmlDownloadPlan(pageUrl)
}

async function resolveGenericHtmlDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const response = await fetch(pageUrl)
  if (!response.ok) {
    throw new Error(`页面请求失败 ${response.status}`)
  }

  const html = await response.text()
  const document = new DOMParser().parseFromString(html, 'text/html')
  const title = cleanTitle(document.querySelector('title')?.textContent || '', new URL(pageUrl).hostname)
  const seen = new Set<string>()
  const pages: DownloadPlanPage[] = []

  for (const node of Array.from(document.querySelectorAll('img'))) {
    const rawUrl = node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-original') || ''
    const url = resolveUrl(rawUrl, pageUrl)
    if (!url || seen.has(url)) continue

    seen.add(url)
    pages.push({
      url,
      name: imageNameFromUrl(url, pages.length),
      referer: pageUrl,
    })
  }

  const quotedImageUrlPattern = /["']([^"']+\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:\?[^"']*)?)["']/gi
  let match: RegExpExecArray | null
  while ((match = quotedImageUrlPattern.exec(html)) !== null && pages.length < 120) {
    const url = resolveUrl(match[1] ?? '', pageUrl)
    if (!url || seen.has(url)) continue

    seen.add(url)
    pages.push({
      url,
      name: imageNameFromUrl(url, pages.length),
      referer: pageUrl,
    })
  }

  if (pages.length === 0) {
    throw new Error('没有解析到图片链接')
  }

  return {
    source: 'link',
    title,
    pageUrl,
    pages: pages.slice(0, 120),
  }
}
