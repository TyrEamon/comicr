export type DownloadPlanSource = 'link' | 'telegraph'

export interface DownloadPlanPage {
  url: string
  name: string
  type?: string
  referer?: string
  headers?: Record<string, string>
}

export interface DownloadPlan {
  source: DownloadPlanSource
  title: string
  pageUrl: string
  pages: DownloadPlanPage[]
}

export const IMAGE_URL_RE = /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?.*)?$/i

export function resolveUrl(rawUrl: string, baseUrl: string) {
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return ''
  }
}

export function cleanTitle(value: string, fallback: string) {
  const title = value.replace(/\s+/g, ' ').trim()
  return title || fallback
}

export function imageNameFromUrl(url: string, index: number) {
  try {
    const parsed = new URL(url)
    const rawName = decodeURIComponent(parsed.pathname.split('/').pop() || `${index + 1}.jpg`)
    return rawName.includes('.') ? rawName : `${rawName}.jpg`
  } catch {
    return `${String(index + 1).padStart(5, '0')}.jpg`
  }
}
