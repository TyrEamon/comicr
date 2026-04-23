import {
  cleanTitle,
  imageNameFromUrl,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from '../downloadPlan'
import { nativeHttpService } from '../nativeHttpService'

const TELEGRAPH_HOSTS = new Set(['telegra.ph', 'telegraph.com'])

export function isTelegraphUrl(value: string) {
  try {
    return TELEGRAPH_HOSTS.has(new URL(value).hostname.toLowerCase())
  } catch {
    return false
  }
}

export async function resolveTelegraphDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const html = await nativeHttpService.getText(pageUrl)
  const document = new DOMParser().parseFromString(html, 'text/html')
  const title = cleanTitle(
    document.querySelector('article h1')?.textContent
      || document.querySelector('title')?.textContent
      || '',
    new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || 'Telegraph',
  )

  const imageNodes = Array.from(document.querySelectorAll('article img'))
  const nodes = imageNodes.length > 0 ? imageNodes : Array.from(document.querySelectorAll('img'))
  const seen = new Set<string>()
  const pages: DownloadPlanPage[] = []

  for (const node of nodes) {
    const rawUrl = node.getAttribute('src') || node.getAttribute('data-src') || ''
    const url = resolveUrl(rawUrl, pageUrl)
    if (!url || seen.has(url)) continue

    seen.add(url)
    pages.push({
      url,
      name: imageNameFromUrl(url, pages.length),
      referer: pageUrl,
    })
  }

  if (pages.length === 0) {
    throw new Error('Telegraph 文章里没有找到图片')
  }

  return {
    source: 'telegraph',
    title,
    pageUrl,
    pages,
  }
}
