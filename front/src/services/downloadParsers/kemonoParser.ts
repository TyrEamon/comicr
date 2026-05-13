import type { DownloadPlan, DownloadPlanPage } from '../downloadPlan'
import { downloadSiteSettings } from '../downloadSiteSettings'
import { nativeHttpService } from '../nativeHttpService'

interface KemonoFile {
  name: string
  path: string
}

interface KemonoPost {
  id: string
  user: string
  service: string
  title: string
  file?: KemonoFile | null
  attachments?: KemonoFile[]
}

interface KemonoApiResponse {
  post?: KemonoPost
}

interface KemonoRoute {
  apiOrigin: string
  imageOrigin: string
  pageUrl: string
  service: string
  userId: string
  postId: string
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const KEMONO_POST_PATH_RE = /^\/([^/]+)\/user\/([^/]+)\/post\/([^/?#]+)\/?$/i
const UNSAFE_NAME_RE = /[<>:"/\\|?*\u0000-\u001f]/g

export function isKemonoUrl(value: string) {
  try {
    return Boolean(parseKemonoRoute(value))
  } catch {
    return false
  }
}

export async function resolveKemonoDownloadPlan(rawUrl: string): Promise<DownloadPlan> {
  const route = parseKemonoRoute(rawUrl)
  if (!route) {
    throw new Error('无法识别 Kemono 链接')
  }

  const headers = kemonoHeaders(route.pageUrl)
  const apiUrl = `${route.apiOrigin}/api/v1/${encodeURIComponent(route.service)}/user/${encodeURIComponent(route.userId)}/post/${encodeURIComponent(route.postId)}`
  const responseText = await nativeHttpService.getText(apiUrl, headers)
  const payload = JSON.parse(responseText) as KemonoApiResponse | KemonoPost
  const post = (payload as KemonoApiResponse).post || (payload as KemonoPost)

  if (!post?.title && !post?.file && !post?.attachments) {
    throw new Error('Kemono API 没有返回帖子内容')
  }

  const pages = collectKemonoImagePages(post, route)
  if (pages.length === 0) {
    throw new Error('Kemono 帖子里没有识别到图片附件')
  }

  return {
    source: 'kemono',
    title: sanitizeKemonoTitle(post.title) || `${route.service}-${route.userId}-${route.postId}`,
    pageUrl: route.pageUrl,
    pages,
  }
}

function parseKemonoRoute(rawUrl: string): KemonoRoute | null {
  const url = new URL(rawUrl)
  const host = url.hostname.toLowerCase()
  const match = KEMONO_POST_PATH_RE.exec(url.pathname)
  if (!match) return null

  const isKemono = host === 'kemono.cr' || host === 'kemono.su' || host === 'kemono.party'
  const isCoomer = host === 'coomer.su' || host === 'coomer.st' || host === 'coomer.party'
  if (!isKemono && !isCoomer) return null

  const apiOrigin = isCoomer ? (host === 'coomer.st' ? 'https://coomer.st' : 'https://coomer.su') : 'https://kemono.cr'
  const imageOrigin = isCoomer ? (host === 'coomer.st' ? 'https://img.coomer.st' : 'https://img.coomer.su') : 'https://img.kemono.cr'
  const service = match[1]
  const userId = match[2]
  const postId = match[3]
  return {
    apiOrigin,
    imageOrigin,
    pageUrl: `${apiOrigin}/${service}/user/${userId}/post/${postId}`,
    service,
    userId,
    postId,
  }
}

function collectKemonoImagePages(post: KemonoPost, route: KemonoRoute) {
  const files: Array<{ type: 'main' | 'attachment', file: KemonoFile }> = []
  if (post.file) files.push({ type: 'main', file: post.file })
  for (const file of post.attachments || []) {
    files.push({ type: 'attachment', file })
  }

  const seen = new Set<string>()
  const pages: DownloadPlanPage[] = []
  for (const item of files) {
    if (!isKemonoImage(item.file)) continue

    const imageUrl = buildKemonoImageUrl(route, item.file)
    if (seen.has(imageUrl)) continue
    seen.add(imageUrl)

    pages.push({
      url: imageUrl,
      name: `${String(pages.length + 1).padStart(3, '0')}${extensionOf(item.file.name) || extensionOf(item.file.path) || '.jpg'}`,
      referer: route.pageUrl,
      headers: kemonoHeaders(route.pageUrl),
    })
  }

  return pages
}

function isKemonoImage(file: KemonoFile) {
  return Boolean(file.path) && (IMAGE_EXTENSIONS.has(extensionOf(file.name)) || IMAGE_EXTENSIONS.has(extensionOf(file.path)))
}

function buildKemonoImageUrl(route: KemonoRoute, file: KemonoFile) {
  return downloadSiteSettings.getSettings().kemonoUseOriginal
    ? buildKemonoOriginalUrl(route.apiOrigin, file)
    : buildKemonoThumbnailUrl(route.imageOrigin, file)
}

function buildKemonoOriginalUrl(origin: string, file: KemonoFile) {
  const normalizedPath = file.path.startsWith('/') ? file.path : `/${file.path}`
  const url = new URL(`/data${normalizedPath}`, origin)
  if (file.name) url.searchParams.set('f', file.name)
  return url.toString()
}

function buildKemonoThumbnailUrl(origin: string, file: KemonoFile) {
  const normalizedPath = file.path.startsWith('/') ? file.path : `/${file.path}`
  return new URL(`/thumbnail/data${normalizedPath}`, origin).toString()
}

function extensionOf(value: string) {
  const index = value.lastIndexOf('.')
  return index >= 0 ? value.slice(index).toLowerCase() : ''
}

function sanitizeKemonoTitle(value: string) {
  const title = String(value || '').replace(UNSAFE_NAME_RE, '_').replace(/\s+/g, ' ').trim()
  return title.length > 120 ? title.slice(0, 120).trim() : title
}

function kemonoHeaders(referer: string) {
  const cookie = downloadSiteSettings.getSettings().kemonoCookie
  return {
    Accept: 'text/css',
    Referer: referer,
    ...(cookie ? { Cookie: cookie } : {}),
  }
}
