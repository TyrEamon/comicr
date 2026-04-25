import JSZip from 'jszip'
import { Capacitor } from '@capacitor/core'
import { normalizeArchiveError } from './archiveErrors'
import { archiveService } from './archiveService'
import { cloudService } from './cloudService'
import {
  deleteImagesByManga,
  deleteRecord,
  getImagesByManga,
  getRecord,
  listMangas,
  putRecord,
} from './db'
import { downloadTargetService } from './downloadTargetService'
import { localFolderService } from './localFolderService'
import type { ImageAsset, MangaImageRecord, MangaItem, MangaSource, ReaderAssetKind, ReaderChapter, ReadingProgress, ShelfState } from './types'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const TXT_CHUNK_CHAR_LIMIT = 12_000
const SHELF_KEY = 'comics-app:shelf:v1'
const PROGRESS_KEY = 'comics-app:progress:v1'
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

type PickedImageFile = File & { webkitRelativePath?: string }
type ReaderAssetInput = {
  name: string
  type?: string
  kind?: ReaderAssetKind
  blob?: Blob
  html?: string
  chapterTitle?: string
  chapterHref?: string
  chapterIndex?: number
}
type EpubManifestItem = {
  path: string
  mediaType: string
  properties: string
}
type EpubTocItem = {
  title: string
  path: string
}

function extensionOf(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function mimeFromName(name: string) {
  switch (extensionOf(name)) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}

function cleanArchiveTitle(name: string) {
  return name.replace(/\.(zip|cbz)$/i, '').trim() || '未命名漫画'
}

function cleanEpubTitle(name: string) {
  return name.replace(/\.epub$/i, '').trim() || '未命名漫画'
}

function cleanTxtTitle(name: string) {
  return name.replace(/\.txt$/i, '').trim() || '未命名小说'
}

function cleanManualTitle(title?: string) {
  return title?.trim() || ''
}

function isImageFile(file: PickedImageFile) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.name))
}

function fileSortPath(file: PickedImageFile) {
  return file.webkitRelativePath || file.name
}

function normalizeZipPath(path: string) {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

function decodeHref(href: string) {
  const cleanHref = href.split('#')[0].split('?')[0].trim().replace(/\\/g, '/')
  try {
    return decodeURI(cleanHref)
  } catch {
    return cleanHref
  }
}

function zipDirName(path: string) {
  const normalized = normalizeZipPath(path)
  const index = normalized.lastIndexOf('/')
  return index >= 0 ? normalized.slice(0, index) : ''
}

function joinZipPath(baseDir: string, href: string) {
  const cleanHref = decodeHref(href)
  if (!cleanHref) return ''
  if (cleanHref.startsWith('/')) return normalizeZipPath(cleanHref.slice(1))
  return normalizeZipPath(baseDir ? `${baseDir}/${cleanHref}` : cleanHref)
}

function xmlElements(parent: Document | Element, localName: string) {
  return Array.from(parent.getElementsByTagNameNS('*', localName))
}

function parseXml(text: string, label: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`${label} 格式不正确`)
  }
  return doc
}

function cleanEpubText(value?: string | null) {
  return value?.replace(/\s+/g, ' ').trim() || ''
}

function normalizeTxtText(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function decodeTextBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const decode = (encoding: string, fatal = false) => new TextDecoder(encoding, { fatal }).decode(bytes)

  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return decode('utf-8')
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return decode('utf-16le')
  }
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return decode('utf-16be')
  }

  try {
    return decode('utf-8', true)
  } catch {
    // Many Chinese TXT files are GBK/GB18030. Keep this local so the reader has no extra dependency.
  }

  for (const encoding of ['gb18030', 'gbk']) {
    try {
      return decode(encoding, true)
    } catch {
      // Try the next common Chinese legacy encoding.
    }
  }

  return decode('utf-8')
}

function isTxtChapterHeading(line: string) {
  const value = line.trim()
  if (value.length < 2 || value.length > 80) return false

  return [
    /^第[0-9０-９零〇一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,12}[章节卷集回部篇][\s:：、.-]*.*$/,
    /^(序章|序言|楔子|引子|前言|正文|终章|尾声|后记|番外(?:篇)?)(?:[\s:：、.-].*)?$/,
    /^(chapter|volume)\s+[0-9ivxlcdm]+[\s:：.-]*.*$/i,
  ].some((pattern) => pattern.test(value))
}

function splitTxtIntoChapters(text: string) {
  const lines = text.split('\n')
  const headingIndexes = lines.reduce<number[]>((indexes, line, index) => {
    if (isTxtChapterHeading(line)) indexes.push(index)
    return indexes
  }, [])

  if (headingIndexes.length === 0) {
    const chunks = splitTxtByLength(text)
    return chunks.map((chunk, index) => ({
      title: chunks.length > 1 ? `第 ${index + 1} 段` : '正文',
      text: chunk,
    }))
  }

  const chapters: Array<{ title: string; text: string }> = []
  const prefix = lines.slice(0, headingIndexes[0]).join('\n').trim()
  if (prefix) {
    chapters.push({ title: '开篇', text: prefix })
  }

  headingIndexes.forEach((headingIndex, index) => {
    const nextHeadingIndex = headingIndexes[index + 1] ?? lines.length
    const section = lines.slice(headingIndex, nextHeadingIndex).join('\n').trim()
    if (!section) return
    chapters.push({
      title: cleanEpubText(lines[headingIndex]) || `章节 ${chapters.length + 1}`,
      text: section,
    })
  })

  return chapters.length > 0 ? chapters : [{ title: '正文', text }]
}

function splitTxtByLength(text: string, limit = TXT_CHUNK_CHAR_LIMIT) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const value = current.trim()
    if (value) chunks.push(value)
    current = ''
  }

  for (const line of lines) {
    if (line.length > limit) {
      pushCurrent()
      for (let index = 0; index < line.length; index += limit) {
        chunks.push(line.slice(index, index + limit))
      }
      continue
    }

    const next = current ? `${current}\n${line}` : line
    if (next.length > limit) {
      pushCurrent()
      current = line
    } else {
      current = next
    }
  }

  pushCurrent()
  return chunks.length > 0 ? chunks : [text]
}

function escapeHtmlText(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function txtToHtml(text: string, chapterTitle?: string) {
  let headingUsed = false
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (!headingUsed && chapterTitle && line === chapterTitle) {
        headingUsed = true
        return `<h2>${escapeHtmlText(line)}</h2>`
      }
      return `<p>${escapeHtmlText(line)}</p>`
    })
    .join('')
}

function dedupeTocItems(items: EpubTocItem[]) {
  const seenPaths = new Set<string>()
  return items.filter((item) => {
    const path = normalizeZipPath(item.path)
    if (!item.title || !path || seenPaths.has(path)) return false
    seenPaths.add(path)
    item.path = path
    return true
  })
}

function parseEpubNavChapters(html: string, baseDir: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const navs = Array.from(parsed.querySelectorAll('nav'))
  const tocNav = navs.find((nav) => {
    const typeText = [
      nav.getAttribute('epub:type'),
      nav.getAttribute('type'),
      nav.getAttribute('role'),
      nav.getAttribute('aria-label'),
    ].join(' ').toLowerCase()
    return typeText.includes('toc') || typeText.includes('目录') || typeText.includes('contents')
  }) || navs[0]

  const root = tocNav || parsed.body || parsed.documentElement
  const items = Array.from(root.querySelectorAll('a[href]')).map((anchor) => ({
    title: cleanEpubText(anchor.textContent),
    path: joinZipPath(baseDir, anchor.getAttribute('href') || ''),
  }))
  return dedupeTocItems(items)
}

function parseEpubNcxChapters(xml: string, baseDir: string) {
  const parsed = parseXml(xml, 'EPUB NCX 目录')
  const items = xmlElements(parsed, 'navPoint').map((navPoint) => {
    const title = cleanEpubText(xmlElements(navPoint, 'text')[0]?.textContent)
    const href = xmlElements(navPoint, 'content')[0]?.getAttribute('src') || ''
    return {
      title,
      path: joinZipPath(baseDir, href),
    }
  })
  return dedupeTocItems(items)
}

function titleFromEpubDocument(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return cleanEpubText(parsed.querySelector('h1, h2, h3, h4, h5, h6, title')?.textContent)
}

function chaptersFromImageRecords(records: Array<Pick<MangaImageRecord, 'id' | 'index' | 'name' | 'kind' | 'chapterTitle' | 'chapterHref' | 'chapterIndex'>>) {
  const chapters: ReaderChapter[] = []
  const seen = new Set<string>()

  for (const record of records.sort((left, right) => left.index - right.index)) {
    const title = record.chapterTitle?.trim() || (record.kind === 'text' ? record.name.trim() : '')
    if (!title) continue

    const key = record.chapterHref
      ? `href:${record.chapterHref}`
      : record.chapterIndex !== undefined
        ? `index:${record.chapterIndex}`
        : `page:${record.index}`
    if (seen.has(key)) continue
    seen.add(key)

    chapters.push({
      id: key,
      index: record.chapterIndex ?? chapters.length,
      title,
      pageIndex: record.index,
      href: record.chapterHref,
    })
  }

  return chapters
}

function firstSrcsetUrl(value: string | null) {
  return value?.split(',')[0]?.trim().split(/\s+/)[0] || ''
}

function imageHrefFromElement(element: Element) {
  return element.getAttribute('src')
    || firstSrcsetUrl(element.getAttribute('srcset'))
    || element.getAttribute('href')
    || element.getAttribute('xlink:href')
    || ''
}

function isEpubDocument(path: string, mediaType = '') {
  const extension = extensionOf(path)
  return mediaType.includes('xhtml')
    || mediaType.includes('html')
    || extension === '.xhtml'
    || extension === '.html'
    || extension === '.htm'
}

function isImageContent(html: string) {
  return /<img[\s>]/i.test(html)
}

function firstImageSrcFromHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return parsed.querySelector('img')?.getAttribute('src') || ''
}

function imageAltFromPath(path: string) {
  return path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'EPUB 插图'
}

async function epubImageDataUrl(
  path: string,
  imageEntriesByPath: Map<string, JSZip.JSZipObject>,
) {
  const entry = imageEntriesByPath.get(normalizeZipPath(path))
  if (!entry) return ''
  const base64 = await entry.async('base64')
  return `data:${mimeFromName(path)};base64,${base64}`
}

async function sanitizeEpubNode(
  node: Node,
  outputDocument: Document,
  baseDir: string,
  imageEntriesByPath: Map<string, JSZip.JSZipObject>,
): Promise<Node | null> {
  if (node.nodeType === Node.TEXT_NODE) {
    return outputDocument.createTextNode(node.textContent || '')
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const sourceElement = node as Element
  const sourceTag = sourceElement.localName.toLowerCase()
  const tagName = sourceTag === 'image' ? 'img' : sourceTag
  const allowedTags = new Set([
    'a', 'article', 'blockquote', 'br', 'code', 'div', 'em', 'figcaption', 'figure',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'li', 'main', 'ol', 'p', 'pre',
    'section', 'small', 'span', 'strong', 'sub', 'sup', 'u', 'ul', 'img',
  ])

  if (!allowedTags.has(tagName)) {
    const fragment = outputDocument.createDocumentFragment()
    for (const child of Array.from(sourceElement.childNodes)) {
      const cleanChild = await sanitizeEpubNode(child, outputDocument, baseDir, imageEntriesByPath)
      if (cleanChild) fragment.appendChild(cleanChild)
    }
    return fragment.childNodes.length > 0 ? fragment : null
  }

  if (tagName === 'img') {
    const href = imageHrefFromElement(sourceElement)
    const imagePath = href ? joinZipPath(baseDir, href) : ''
    const dataUrl = imagePath ? await epubImageDataUrl(imagePath, imageEntriesByPath) : ''
    if (!dataUrl) return null

    const image = outputDocument.createElement('img')
    image.setAttribute('src', dataUrl)
    image.setAttribute('alt', sourceElement.getAttribute('alt') || imageAltFromPath(imagePath))
    image.setAttribute('loading', 'lazy')
    return image
  }

  const cleanElement = outputDocument.createElement(tagName)
  if (tagName === 'a') {
    cleanElement.setAttribute('role', 'link')
  }

  for (const child of Array.from(sourceElement.childNodes)) {
    const cleanChild = await sanitizeEpubNode(child, outputDocument, baseDir, imageEntriesByPath)
    if (cleanChild) cleanElement.appendChild(cleanChild)
  }

  return cleanElement
}

async function sanitizeEpubHtml(
  html: string,
  baseDir: string,
  imageEntriesByPath: Map<string, JSZip.JSZipObject>,
) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const output = document.implementation.createHTMLDocument('')
  const root = output.createElement('div')
  const sourceRoot = parsed.body || parsed.documentElement

  for (const child of Array.from(sourceRoot.childNodes)) {
    const cleanChild = await sanitizeEpubNode(child, output, baseDir, imageEntriesByPath)
    if (cleanChild) root.appendChild(cleanChild)
  }

  return {
    html: root.innerHTML.trim(),
    text: root.textContent?.trim() || '',
  }
}

function cleanFolderTitle(files: PickedImageFile[], title?: string) {
  const manualTitle = cleanManualTitle(title)
  if (manualTitle) return manualTitle

  const firstRelativePath = files.find((file) => file.webkitRelativePath)?.webkitRelativePath
  if (firstRelativePath) {
    const folderName = firstRelativePath.split('/').filter(Boolean)[0]
    if (folderName) return folderName
  }

  const firstName = files[0]?.name
  return firstName ? firstName.replace(/\.[^.]+$/, '').trim() || '图片导入' : '图片导入'
}

function randomId(prefix: string) {
  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${value}`
}

function stableId(prefix: string, key: string) {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(31, hash) + key.charCodeAt(index)
    hash |= 0
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

function saveJsonRecord<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

export const libraryService = {
  stableImportId(prefix: string, key: string) {
    return stableId(prefix, key)
  },

  async listMangas() {
    const localMangas = await listMangas()
    const cloudMangas = cloudService.getWebDavIndexedMangas()
    const localIds = new Set(localMangas.map((manga) => manga.id))
    return [...cloudMangas.filter((manga) => !localIds.has(manga.id)), ...localMangas]
      .sort((left, right) => right.updatedAt - left.updatedAt)
  },

  async getManga(id: string) {
    if (cloudService.isWebDavReaderId(id)) {
      return cloudService.getWebDavIndexedMangas().find((manga) => manga.id === id)
    }
    return getRecord<MangaItem>('mangas', id)
  },

  async importArchive(file: File, source: MangaSource = 'archive', title?: string) {
    try {
      const zip = await JSZip.loadAsync(file)
      const entries = Object.values(zip.files)
        .filter((entry) => !entry.dir && IMAGE_EXTENSIONS.has(extensionOf(entry.name)))
        .sort((left, right) => collator.compare(left.name, right.name))

      if (entries.length === 0) {
        throw new Error('压缩包里没有可导入的图片')
      }

      const blobs = await Promise.all(entries.map(async (entry) => ({
        name: entry.name.split('/').pop() || entry.name,
        type: mimeFromName(entry.name),
        blob: await entry.async('blob'),
      })))

      return this.importImageBlobs(cleanManualTitle(title) || cleanArchiveTitle(file.name), blobs, source)
    } catch (error) {
      throw normalizeArchiveError(error, '导入压缩包')
    }
  },

  async importEpubFile(file: File, title?: string) {
    try {
      const zip = await JSZip.loadAsync(file)
      const entries = Object.values(zip.files).filter((entry) => !entry.dir)
      const entriesByPath = new Map(entries.map((entry) => [normalizeZipPath(entry.name), entry]))
      const imageEntries = entries.filter((entry) => IMAGE_EXTENSIONS.has(extensionOf(entry.name)))
      const imageEntriesByPath = new Map(imageEntries.map((entry) => [normalizeZipPath(entry.name), entry]))

      const pages: ReaderAssetInput[] = []
      const chapterTitleByPath = new Map<string, string>()
      const chapterIndexByPath = new Map<string, number>()
      const fallbackChapterIndexByPath = new Map<string, number>()
      const seenImagePages = new Set<string>()
      const chapterForPage = (path: string, fallbackTitle: string) => {
        const normalized = normalizeZipPath(path)
        const mappedTitle = chapterTitleByPath.get(normalized)
        let chapterIndex = chapterIndexByPath.get(normalized)

        if (chapterIndex === undefined) {
          if (!fallbackChapterIndexByPath.has(normalized)) {
            fallbackChapterIndexByPath.set(normalized, chapterIndexByPath.size + fallbackChapterIndexByPath.size)
          }
          chapterIndex = fallbackChapterIndexByPath.get(normalized) ?? 0
        }

        return {
          chapterTitle: cleanEpubText(mappedTitle || fallbackTitle) || `章节 ${chapterIndex + 1}`,
          chapterHref: normalized,
          chapterIndex,
        }
      }
      const addImagePage = async (
        path: string,
        chapter?: Pick<ReaderAssetInput, 'chapterTitle' | 'chapterHref' | 'chapterIndex'>,
      ) => {
        const normalized = normalizeZipPath(path)
        const entry = imageEntriesByPath.get(normalized)
        if (!entry || seenImagePages.has(normalized)) return
        seenImagePages.add(normalized)
        pages.push({
          name: normalized.split('/').pop() || normalized,
          type: mimeFromName(normalized),
          kind: 'image',
          blob: await entry.async('blob'),
          ...chapter,
        })
      }

      const containerEntry = entriesByPath.get('META-INF/container.xml')
      let opfPath = ''
      if (containerEntry) {
        const container = parseXml(await containerEntry.async('text'), 'EPUB 容器')
        opfPath = xmlElements(container, 'rootfile')[0]?.getAttribute('full-path') || ''
        opfPath = normalizeZipPath(opfPath)
      }
      if (!opfPath || !entriesByPath.has(opfPath)) {
        opfPath = entries
          .map((entry) => normalizeZipPath(entry.name))
          .find((path) => extensionOf(path) === '.opf') || ''
      }

      let epubTitle = ''
      if (opfPath) {
        const opfEntry = entriesByPath.get(opfPath)
        if (opfEntry) {
          const opf = parseXml(await opfEntry.async('text'), 'EPUB 目录')
          const opfDir = zipDirName(opfPath)
          epubTitle = xmlElements(opf, 'title')[0]?.textContent?.trim() || ''

          const manifest = new Map<string, EpubManifestItem>()
          for (const item of xmlElements(opf, 'item')) {
            const id = item.getAttribute('id')
            const href = item.getAttribute('href')
            if (!id || !href) continue
            manifest.set(id, {
              path: joinZipPath(opfDir, href),
              mediaType: item.getAttribute('media-type') || '',
              properties: item.getAttribute('properties') || '',
            })
          }

          const spine = xmlElements(opf, 'spine')[0]
          const navItem = Array.from(manifest.values()).find((item) => item.properties.split(/\s+/).includes('nav'))
          const ncxItem = (spine?.getAttribute('toc') ? manifest.get(spine.getAttribute('toc') || '') : undefined)
            || Array.from(manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml' || extensionOf(item.path) === '.ncx')
          let tocItems: EpubTocItem[] = []

          if (navItem) {
            const navEntry = entriesByPath.get(navItem.path)
            if (navEntry) {
              tocItems = parseEpubNavChapters(await navEntry.async('text'), zipDirName(navItem.path))
            }
          }

          if (tocItems.length === 0 && ncxItem) {
            const ncxEntry = entriesByPath.get(ncxItem.path)
            if (ncxEntry) {
              tocItems = parseEpubNcxChapters(await ncxEntry.async('text'), zipDirName(ncxItem.path))
            }
          }

          tocItems.forEach((chapter, index) => {
            if (chapterTitleByPath.has(chapter.path)) return
            chapterTitleByPath.set(chapter.path, chapter.title)
            chapterIndexByPath.set(chapter.path, index)
          })

          for (const itemref of xmlElements(opf, 'itemref')) {
            const idref = itemref.getAttribute('idref')
            const item = idref ? manifest.get(idref) : undefined
            if (!item) continue
            if (item.properties.split(/\s+/).includes('nav')) continue

            if (IMAGE_EXTENSIONS.has(extensionOf(item.path)) || item.mediaType.startsWith('image/')) {
              await addImagePage(item.path, chapterForPage(item.path, item.path.split('/').pop() || '插图'))
              continue
            }

            if (!isEpubDocument(item.path, item.mediaType)) continue

            const pageEntry = entriesByPath.get(item.path)
            if (!pageEntry) continue

            const pageDir = zipDirName(item.path)
            const rawHtml = await pageEntry.async('text')
            const sanitized = await sanitizeEpubHtml(rawHtml, pageDir, imageEntriesByPath)
            const chapter = chapterForPage(
              item.path,
              titleFromEpubDocument(rawHtml) || item.path.split('/').pop()?.replace(/\.(xhtml|html|htm)$/i, '') || '',
            )

            if (sanitized.text) {
              pages.push({
                name: chapter.chapterTitle,
                type: 'text/html',
                kind: 'text',
                html: sanitized.html,
                ...chapter,
              })
              continue
            }

            if (isImageContent(sanitized.html)) {
              pages.push({
                name: chapter.chapterTitle,
                type: 'text/html',
                kind: 'text',
                html: sanitized.html,
                ...chapter,
              })
            }
          }
        }
      }

      if (pages.length === 0 && imageEntries.length > 0) {
        for (const path of imageEntries
          .map((entry) => normalizeZipPath(entry.name))
          .sort((left, right) => collator.compare(left, right))) {
          await addImagePage(path)
        }
      }

      if (pages.length === 0) {
        throw new Error('EPUB 里没有可导入的正文或图片')
      }

      const mangaTitle = cleanManualTitle(title) || epubTitle || cleanEpubTitle(file.name)
      return this.importReaderAssets(mangaTitle, pages, 'epub')
    } catch (error) {
      throw normalizeArchiveError(error, '导入 EPUB')
    }
  },

  async importTextFile(file: File, title?: string) {
    const text = normalizeTxtText(decodeTextBuffer(await file.arrayBuffer()))
    if (!text) {
      throw new Error('TXT 里没有可导入的正文')
    }

    const pages: ReaderAssetInput[] = []
    const chapters = splitTxtIntoChapters(text)

    chapters.forEach((chapter, chapterIndex) => {
      const chunks = splitTxtByLength(chapter.text)
      chunks.forEach((chunk, chunkIndex) => {
        pages.push({
          name: chunks.length > 1 ? `${chapter.title} ${chunkIndex + 1}` : chapter.title,
          type: 'text/html',
          kind: 'text',
          html: txtToHtml(chunk, chunkIndex === 0 ? chapter.title : undefined),
          chapterTitle: chapter.title,
          chapterHref: `txt:${chapterIndex}`,
          chapterIndex,
        })
      })
    })

    if (pages.length === 0) {
      throw new Error('TXT 里没有可导入的正文')
    }

    const mangaTitle = cleanManualTitle(title) || cleanTxtTitle(file.name)
    return this.importReaderAssets(mangaTitle, pages, 'txt')
  },

  async importImageFiles(files: File[], source: MangaSource = 'archive', title?: string) {
    const imageFiles = files
      .map((file) => file as PickedImageFile)
      .filter(isImageFile)
      .sort((left, right) => collator.compare(fileSortPath(left), fileSortPath(right)))

    if (imageFiles.length === 0) {
      throw new Error('选择的文件夹里没有可导入的图片')
    }

    const blobs = imageFiles.map((file) => ({
      name: fileSortPath(file),
      type: file.type || mimeFromName(file.name),
      blob: file,
    }))

    return this.importImageBlobs(cleanFolderTitle(imageFiles, title), blobs, source)
  },

  async importImageBlobs(
    title: string,
    images: Array<{ name: string; type?: string; blob: Blob }>,
    source: MangaSource = 'download',
  ) {
    return this.importReaderAssets(
      title,
      images.map((image) => ({
        ...image,
        kind: 'image',
      })),
      source,
    )
  },

  async importReaderAssets(
    title: string,
    assets: ReaderAssetInput[],
    source: MangaSource = 'download',
  ) {
    if (assets.length === 0) {
      throw new Error('没有可导入的页面')
    }

    const now = Date.now()
    const mangaId = randomId('manga')
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: mangaId,
      imageCount: assets.length,
      source,
      addedAt: now,
      updatedAt: now,
    }

    await putRecord('mangas', manga)

    for (const [index, asset] of assets.entries()) {
      const kind = asset.kind || 'image'
      const record: MangaImageRecord = {
        id: `${mangaId}:${index}`,
        mangaId,
        index,
        name: asset.name,
        type: asset.type || asset.blob?.type || (kind === 'text' ? 'text/html' : mimeFromName(asset.name)),
        kind,
        html: kind === 'text' ? asset.html || '' : undefined,
        chapterTitle: asset.chapterTitle,
        chapterHref: asset.chapterHref,
        chapterIndex: asset.chapterIndex,
        blob: kind === 'image' ? asset.blob : undefined,
      }
      await putRecord('images', record)
    }

    return manga
  },

  async importImageRefs(
    title: string,
    images: Array<{ name: string; type?: string; uri: string }>,
    source: MangaSource = 'folder',
    options?: { id?: string; localPath?: string },
  ) {
    if (images.length === 0) {
      throw new Error('没有可索引的图片')
    }

    const now = Date.now()
    const mangaId = options?.id || randomId('manga')
    const existing = options?.id ? await getRecord<MangaItem>('mangas', mangaId) : undefined
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: options?.localPath || mangaId,
      imageCount: images.length,
      source,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
    }

    if (existing) {
      await deleteImagesByManga(mangaId)
    }
    await putRecord('mangas', manga)

    for (const [index, image] of images.entries()) {
      const record: MangaImageRecord = {
        id: `${mangaId}:${index}`,
        mangaId,
        index,
        name: image.name,
        type: image.type || mimeFromName(image.name),
        uri: image.uri,
      }
      await putRecord('images', record)
    }

    return manga
  },

  async importArchiveRefs(
    title: string,
    images: Array<{ name: string; type?: string; archiveUri: string; entryName: string }>,
    options?: { id?: string; localPath?: string },
  ) {
    if (images.length === 0) {
      throw new Error('没有可索引的压缩包图片')
    }

    const now = Date.now()
    const mangaId = options?.id || randomId('manga')
    const existing = options?.id ? await getRecord<MangaItem>('mangas', mangaId) : undefined
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: options?.localPath || mangaId,
      imageCount: images.length,
      source: 'archive',
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
    }

    if (existing) {
      await deleteImagesByManga(mangaId)
    }
    await putRecord('mangas', manga)

    for (const [index, image] of images.entries()) {
      const record: MangaImageRecord = {
        id: `${mangaId}:${index}`,
        mangaId,
        index,
        name: image.name,
        type: image.type || mimeFromName(image.name),
        archiveUri: image.archiveUri,
        archiveEntryName: image.entryName,
      }
      await putRecord('images', record)
    }

    return manga
  },

  async getCoverUrl(mangaId: string) {
    if (cloudService.isWebDavReaderId(mangaId)) {
      const path = cloudService.pathFromReaderId(mangaId)
      return cloudService.getCachedWebDavCoverUrl(path)
    }

    const images = await getImagesByManga(mangaId)
    const cover = images.find((image) => (image.kind || 'image') === 'image')
    if (!cover) {
      const textCover = images.find((image) => image.kind === 'text' && image.html)
      return textCover?.html ? firstImageSrcFromHtml(textCover.html) : ''
    }
    if (cover.blob) return URL.createObjectURL(cover.blob)
    if (cover.uri && localFolderService.isAvailable()) {
      const contentSrc = Capacitor.convertFileSrc(cover.uri)
      if (contentSrc) return contentSrc

      const blob = await localFolderService.readImage(cover.uri, cover.type)
      return URL.createObjectURL(blob)
    }
    if (cover.archiveUri && cover.archiveEntryName && archiveService.isAvailable()) {
      const contentSrc = archiveService.entryContentSrc(cover.archiveUri, cover.archiveEntryName)
      if (contentSrc) return contentSrc

      const blob = await archiveService.readEntry(cover.archiveUri, cover.archiveEntryName, cover.type)
      return URL.createObjectURL(blob)
    }
    return ''
  },

  async getImageAssets(mangaId: string): Promise<ImageAsset[]> {
    const images = await getImagesByManga(mangaId)
    return Promise.all(
      images.map(async (image) => ({
        id: image.id,
        index: image.index,
        name: image.name,
        type: image.type,
        kind: image.kind || 'image',
        html: image.html,
        chapterTitle: image.chapterTitle,
        chapterHref: image.chapterHref,
        chapterIndex: image.chapterIndex,
        src: image.kind === 'text' ? '' : image.blob ? URL.createObjectURL(image.blob) : '',
        uri: image.uri,
        archiveUri: image.archiveUri,
        archiveEntryName: image.archiveEntryName,
      })),
    )
  },

  async getReaderChapters(mangaId: string): Promise<ReaderChapter[]> {
    if (cloudService.isWebDavReaderId(mangaId)) return []
    const images = await getImagesByManga(mangaId)
    return chaptersFromImageRecords(images)
  },

  async loadImageAssetSrc(image: ImageAsset) {
    if (image.kind === 'text') return ''
    if (image.src) return image.src
    if (image.archiveUri && image.archiveEntryName) {
      const contentSrc = archiveService.entryContentSrc(image.archiveUri, image.archiveEntryName)
      if (contentSrc) return contentSrc

      const blob = await archiveService.readEntry(image.archiveUri, image.archiveEntryName, image.type)
      return URL.createObjectURL(blob)
    }
    if (!image.uri) return ''

    if (localFolderService.isAvailable()) {
      const contentSrc = Capacitor.convertFileSrc(image.uri)
      if (contentSrc) return contentSrc
    }

    const blob = await localFolderService.readImage(image.uri, image.type)
    return URL.createObjectURL(blob)
  },

  async deleteManga(mangaId: string, options?: { deleteFiles?: boolean }) {
    if (cloudService.isWebDavReaderId(mangaId)) {
      cloudService.removeWebDavIndexedManga(cloudService.pathFromReaderId(mangaId))
      this.removeProgress(mangaId)
      this.removeShelfState(mangaId)
      return
    }

    const manga = await getRecord<MangaItem>('mangas', mangaId)
    if (options?.deleteFiles && manga?.source === 'download' && downloadTargetService.isAvailable()) {
      const images = await getImagesByManga(mangaId)
      const uris = images.map((image) => image.uri).filter((uri): uri is string => Boolean(uri))
      const result = await downloadTargetService.deleteImages(uris)
      if (result.failed > 0) {
        throw new Error(`有 ${result.failed} 张下载图片删除失败，请检查下载目录授权`)
      }
    }

    await deleteImagesByManga(mangaId)
    await deleteRecord('mangas', mangaId)
    this.removeProgress(mangaId)
    this.removeShelfState(mangaId)
  },

  getShelfState(mangaId: string): ShelfState {
    const states = loadJsonRecord<Record<string, ShelfState>>(SHELF_KEY, {})
    const savedState = states[mangaId]
    return {
      favorite: savedState?.favorite ?? false,
      readLater: savedState?.readLater ?? false,
      pinned: savedState?.pinned ?? false,
      updatedAt: savedState?.updatedAt ?? 0,
    }
  },

  setShelfState(mangaId: string, state: Partial<ShelfState>) {
    const states = loadJsonRecord<Record<string, ShelfState>>(SHELF_KEY, {})
    states[mangaId] = {
      ...this.getShelfState(mangaId),
      ...state,
      updatedAt: Date.now(),
    }
    saveJsonRecord(SHELF_KEY, states)
  },

  removeShelfState(mangaId: string) {
    const states = loadJsonRecord<Record<string, ShelfState>>(SHELF_KEY, {})
    delete states[mangaId]
    saveJsonRecord(SHELF_KEY, states)
  },

  getProgress(mangaId: string): ReadingProgress | null {
    const progress = loadJsonRecord<Record<string, ReadingProgress>>(PROGRESS_KEY, {})
    return progress[mangaId] ?? null
  },

  saveProgress(mangaId: string, lastIndex: number, totalImages: number) {
    const progress = loadJsonRecord<Record<string, ReadingProgress>>(PROGRESS_KEY, {})
    progress[mangaId] = {
      mangaId,
      lastIndex,
      totalImages,
      progressPercent: totalImages <= 0 ? 0 : Math.min(1, (lastIndex + 1) / totalImages),
      updatedAt: Date.now(),
    }
    saveJsonRecord(PROGRESS_KEY, progress)
  },

  removeProgress(mangaId: string) {
    const progress = loadJsonRecord<Record<string, ReadingProgress>>(PROGRESS_KEY, {})
    delete progress[mangaId]
    saveJsonRecord(PROGRESS_KEY, progress)
  },
}
