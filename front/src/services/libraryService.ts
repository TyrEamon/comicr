import JSZip from 'jszip'
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
import type { ImageAsset, MangaImageRecord, MangaItem, MangaSource, ReadingProgress, ShelfState } from './types'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const SHELF_KEY = 'comics-app:shelf:v1'
const PROGRESS_KEY = 'comics-app:progress:v1'
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })

type PickedImageFile = File & { webkitRelativePath?: string }

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

function cleanManualTitle(title?: string) {
  return title?.trim() || ''
}

function isImageFile(file: PickedImageFile) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.name))
}

function fileSortPath(file: PickedImageFile) {
  return file.webkitRelativePath || file.name
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
    if (images.length === 0) {
      throw new Error('没有可导入的图片')
    }

    const now = Date.now()
    const mangaId = randomId('manga')
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: mangaId,
      imageCount: images.length,
      source,
      addedAt: now,
      updatedAt: now,
    }

    await putRecord('mangas', manga)

    for (const [index, image] of images.entries()) {
      const record: MangaImageRecord = {
        id: `${mangaId}:${index}`,
        mangaId,
        index,
        name: image.name,
        type: image.type || image.blob.type || mimeFromName(image.name),
        blob: image.blob,
      }
      await putRecord('images', record)
    }

    return manga
  },

  async importImageRefs(
    title: string,
    images: Array<{ name: string; type?: string; uri: string }>,
    source: MangaSource = 'folder',
  ) {
    if (images.length === 0) {
      throw new Error('没有可索引的图片')
    }

    const now = Date.now()
    const mangaId = randomId('manga')
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: mangaId,
      imageCount: images.length,
      source,
      addedAt: now,
      updatedAt: now,
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
  ) {
    if (images.length === 0) {
      throw new Error('没有可索引的压缩包图片')
    }

    const now = Date.now()
    const mangaId = randomId('manga')
    const manga: MangaItem = {
      id: mangaId,
      title: title.trim() || '未命名漫画',
      localPath: mangaId,
      imageCount: images.length,
      source: 'archive',
      addedAt: now,
      updatedAt: now,
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
    const cover = images[0]
    if (!cover) return ''
    if (cover.blob) return URL.createObjectURL(cover.blob)
    if (cover.uri && localFolderService.isAvailable()) {
      const blob = await localFolderService.readImage(cover.uri, cover.type)
      return URL.createObjectURL(blob)
    }
    if (cover.archiveUri && cover.archiveEntryName && archiveService.isAvailable()) {
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
        src: image.blob ? URL.createObjectURL(image.blob) : '',
        uri: image.uri,
        archiveUri: image.archiveUri,
        archiveEntryName: image.archiveEntryName,
      })),
    )
  },

  async loadImageAssetSrc(image: ImageAsset) {
    if (image.src) return image.src
    if (image.archiveUri && image.archiveEntryName) {
      const blob = await archiveService.readEntry(image.archiveUri, image.archiveEntryName, image.type)
      return URL.createObjectURL(blob)
    }
    if (!image.uri) return ''

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
