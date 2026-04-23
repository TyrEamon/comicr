import {
  cleanTitle,
  resolveUrl,
  type DownloadPlan,
  type DownloadPlanPage,
} from '../downloadPlan'
import { nativeHttpService } from '../nativeHttpService'

type ImageStrategy = 'webp' | 'jpg'

export function isNhentaiUrl(value: string) {
  try {
    const url = new URL(value)
    return url.hostname.toLowerCase() === 'nhentai.xxx' && /\/g\/\d+\/?/i.test(url.pathname)
  } catch {
    return false
  }
}

export async function resolveNhentaiDownloadPlan(pageUrl: string): Promise<DownloadPlan> {
  const galleryId = pageUrl.match(/\/g\/(\d+)\/?/i)?.[1]
  if (!galleryId) {
    throw new Error('无法从 nhentai 链接提取作品 ID')
  }

  const html = await nativeHttpService.getText(pageUrl)
  const document = new DOMParser().parseFromString(html, 'text/html')
  const title = cleanTitle(
    document.querySelector('body > div.main_cnt > div > div.gallery_top > div.info > h1')?.textContent || '',
    `nhentai-${galleryId}`,
  )
  const thumbnailUrls = Array.from(document.querySelectorAll('#thumbs_append > div > a > img'))
    .map((image) => image.getAttribute('data-src') || '')
    .filter(Boolean)

  if (thumbnailUrls.length === 0) {
    throw new Error('nhentai 页面里没有找到图片')
  }

  const strategy = await determineImageStrategy(thumbnailUrls[0])
  const imageUrls = thumbnailUrls.map((url) => convertThumbnailToFullImage(url, strategy))
  const moreImages = await loadMoreImages(document, galleryId, imageUrls.length, strategy)
  imageUrls.push(...moreImages)

  const extension = strategy === 'webp' ? 'webp' : 'jpg'
  const pages: DownloadPlanPage[] = imageUrls.map((url, index) => ({
    url,
    name: `${String(index + 1).padStart(3, '0')}.${extension}`,
    referer: pageUrl,
  }))

  return {
    source: 'nhentai',
    title,
    pageUrl,
    pages,
  }
}

function convertThumbnailToFullImage(thumbnailUrl: string, strategy: ImageStrategy) {
  return thumbnailUrl.replace(/(\d+)t\.jpg$/i, `$1.${strategy}`)
}

async function determineImageStrategy(firstThumbnailUrl: string): Promise<ImageStrategy> {
  const webpUrl = convertThumbnailToFullImage(firstThumbnailUrl, 'webp')
  try {
    await nativeHttpService.head(webpUrl)
    return 'webp'
  } catch {
    // fall through to jpg
  }

  const jpgUrl = convertThumbnailToFullImage(firstThumbnailUrl, 'jpg')
  try {
    await nativeHttpService.head(jpgUrl)
    return 'jpg'
  } catch {
    return 'webp'
  }
}

async function loadMoreImages(document: Document, galleryId: string, visiblePages: number, strategy: ImageStrategy) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
  const server = valueOf(document, '#load_server')
  const userId = valueOf(document, '#gallery_id')
  const groupId = valueOf(document, '#load_id')
  const imageDir = valueOf(document, '#load_dir')
  const totalPages = valueOf(document, '#load_pages')

  if (!csrfToken || !server || !userId || !groupId || !imageDir || !totalPages || visiblePages >= Number(totalPages)) {
    return []
  }

  const form = new URLSearchParams()
  form.set('_token', csrfToken)
  form.set('server', server)
  form.set('u_id', userId)
  form.set('g_id', groupId)
  form.set('img_dir', imageDir)
  form.set('visible_pages', String(visiblePages))
  form.set('total_pages', totalPages)
  form.set('type', '2')

  try {
    const html = await nativeHttpService.postText(
      'https://nhentai.xxx/modules/thumbs_loader.php',
      form.toString(),
      { 'X-Requested-With': 'XMLHttpRequest' },
    )
    const apiDocument = new DOMParser().parseFromString(html, 'text/html')
    return Array.from(apiDocument.querySelectorAll('img'))
      .map((image) => resolveUrl(image.getAttribute('data-src') || '', 'https://nhentai.xxx/'))
      .filter(Boolean)
      .map((url) => convertThumbnailToFullImage(url, strategy))
  } catch {
    return []
  }
}

function valueOf(document: Document, selector: string) {
  return (document.querySelector(selector) as HTMLInputElement | null)?.value || ''
}
