import JSZip from 'jszip'
import {
  deleteImagesByManga,
  deleteRecord,
  getImagesByManga,
  getRecord,
  listMangas,
  putRecord,
} from './db'
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

function isImageFile(file: PickedImageFile) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.name))
}

function fileSortPath(file: PickedImageFile) {
  return file.webkitRelativePath || file.name
}

function cleanFolderTitle(files: PickedImageFile[]) {
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
    return listMangas()
  },

  async getManga(id: string) {
    return getRecord<MangaItem>('mangas', id)
  },

  async importArchive(file: File, source: MangaSource = 'archive') {
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

    return this.importImageBlobs(cleanArchiveTitle(file.name), blobs, source)
  },

  async importImageFiles(files: File[], source: MangaSource = 'archive') {
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

    return this.importImageBlobs(cleanFolderTitle(imageFiles), blobs, source)
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

  async getCoverUrl(mangaId: string) {
    const images = await getImagesByManga(mangaId)
    const cover = images[0]
    return cover ? URL.createObjectURL(cover.blob) : ''
  },

  async getImageAssets(mangaId: string): Promise<ImageAsset[]> {
    const images = await getImagesByManga(mangaId)
    return images.map((image) => ({
      id: image.id,
      index: image.index,
      name: image.name,
      type: image.type,
      src: URL.createObjectURL(image.blob),
    }))
  },

  async deleteManga(mangaId: string) {
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
