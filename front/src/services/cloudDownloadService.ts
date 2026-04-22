import { cloudService } from './cloudService'
import { downloadTargetService } from './downloadTargetService'
import { libraryService } from './libraryService'

const WEBDAV_DOWNLOADED_KEY = 'comics-app:webdav-downloaded:v1'
const DOWNLOAD_SETTINGS_KEY = 'comics-app:download-settings:v1'
const DEFAULT_DOWNLOAD_CONCURRENCY = 1
const MAX_DOWNLOAD_CONCURRENCY = 3

export interface CloudDownloadProgress {
  title: string
  current: number
  total: number
}

export interface DownloadSettings {
  concurrency: number
}

interface WebDavDownloadOptions {
  shouldCancel?: () => boolean
}

function normalizePath(path: string) {
  const segments = path.split('/').map((segment) => segment.trim()).filter(Boolean)
  return segments.length > 0 ? `/${segments.join('/')}` : ''
}

function loadDownloadedRecords() {
  try {
    return JSON.parse(localStorage.getItem(WEBDAV_DOWNLOADED_KEY) || '{}') as Record<string, { mangaId: string; updatedAt: number }>
  } catch {
    return {}
  }
}

function saveDownloadedRecords(records: Record<string, { mangaId: string; updatedAt: number }>) {
  localStorage.setItem(WEBDAV_DOWNLOADED_KEY, JSON.stringify(records))
}

function clampConcurrency(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return DEFAULT_DOWNLOAD_CONCURRENCY
  return Math.min(MAX_DOWNLOAD_CONCURRENCY, Math.max(1, Math.round(numberValue)))
}

function loadDownloadSettings(): DownloadSettings {
  try {
    const rawValue = localStorage.getItem(DOWNLOAD_SETTINGS_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) as Partial<DownloadSettings> : {}
    return {
      concurrency: clampConcurrency(parsed.concurrency),
    }
  } catch {
    return {
      concurrency: DEFAULT_DOWNLOAD_CONCURRENCY,
    }
  }
}

function saveDownloadSettings(settings: DownloadSettings) {
  localStorage.setItem(DOWNLOAD_SETTINGS_KEY, JSON.stringify({
    concurrency: clampConcurrency(settings.concurrency),
  }))
}

export const cloudDownloadService = {
  isWebDavDownloaded(path: string) {
    return Boolean(loadDownloadedRecords()[normalizePath(path)])
  },

  getDownloadSettings() {
    return loadDownloadSettings()
  },

  updateDownloadSettings(settings: Partial<DownloadSettings>) {
    const nextSettings = {
      ...loadDownloadSettings(),
      ...settings,
    }
    nextSettings.concurrency = clampConcurrency(nextSettings.concurrency)
    saveDownloadSettings(nextSettings)
    return nextSettings
  },

  forgetDownloadedManga(mangaId: string) {
    const records = loadDownloadedRecords()
    let changed = false
    for (const [path, record] of Object.entries(records)) {
      if (record.mangaId === mangaId) {
        delete records[path]
        changed = true
      }
    }
    if (changed) saveDownloadedRecords(records)
  },

  async downloadWebDavManga(path: string, onProgress?: (progress: CloudDownloadProgress) => void, options?: WebDavDownloadOptions) {
    const normalizedPath = normalizePath(path)
    const remoteManga = await cloudService.getWebDavDownloadItems(path)
    const downloadedImages: Array<{ name: string; type?: string; uri?: string; blob?: Blob } | null> = new Array(remoteManga.files.length).fill(null)
    const concurrency = Math.min(loadDownloadSettings().concurrency, Math.max(1, remoteManga.files.length))
    let outputPath = downloadTargetService.getTargetLabel()
    let nextIndex = 0
    let completed = 0

    async function downloadOne(index: number) {
      if (options?.shouldCancel?.()) {
        throw new Error('下载已取消')
      }

      const file = remoteManga.files[index]
      const blob = await cloudService.getCachedWebDavImageBlob(normalizedPath, file.path)
        ?? await cloudService.fetchWebDavBlob(file.path)

      if (options?.shouldCancel?.()) {
        throw new Error('下载已取消')
      }

      if (downloadTargetService.isAvailable()) {
        const writtenImage = await downloadTargetService.writeImage(remoteManga.title, file.name, file.type, blob)
        outputPath = writtenImage.folderUri || outputPath
        downloadedImages[index] = {
          name: writtenImage.name || file.name,
          type: writtenImage.type || file.type,
          uri: writtenImage.uri,
        }
      } else {
        downloadedImages[index] = {
          name: file.name,
          type: file.type,
          blob,
        }
      }

      completed += 1
      onProgress?.({
        title: remoteManga.title,
        current: completed,
        total: remoteManga.files.length,
      })
    }

    async function runWorker() {
      while (nextIndex < remoteManga.files.length) {
        const index = nextIndex
        nextIndex += 1
        await downloadOne(index)
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()))

    if (options?.shouldCancel?.()) {
      throw new Error('下载已取消')
    }

    const imageRefs = downloadedImages
      .filter((image): image is { name: string; type?: string; uri: string } => Boolean(image?.uri))
    const imageBlobs = downloadedImages
      .filter((image): image is { name: string; type?: string; blob: Blob } => Boolean(image?.blob))

    const manga = imageRefs.length > 0
      ? await libraryService.importImageRefs(remoteManga.title, imageRefs, 'download')
      : await libraryService.importImageBlobs(remoteManga.title, imageBlobs, 'download')

    const downloadedRecords = loadDownloadedRecords()
    downloadedRecords[normalizedPath] = {
      mangaId: manga.id,
      updatedAt: Date.now(),
    }
    saveDownloadedRecords(downloadedRecords)

    return {
      manga,
      outputPath,
    }
  },
}
