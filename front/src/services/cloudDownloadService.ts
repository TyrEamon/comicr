import { cloudService } from './cloudService'
import { downloadTargetService } from './downloadTargetService'
import { libraryService } from './libraryService'

const WEBDAV_DOWNLOADED_KEY = 'comics-app:webdav-downloaded:v1'

export interface CloudDownloadProgress {
  title: string
  current: number
  total: number
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

export const cloudDownloadService = {
  isWebDavDownloaded(path: string) {
    return Boolean(loadDownloadedRecords()[normalizePath(path)])
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
    const imageRefs: Array<{ name: string; type?: string; uri: string }> = []
    const imageBlobs: Array<{ name: string; type?: string; blob: Blob }> = []
    let outputPath = downloadTargetService.getTargetLabel()

    for (const [index, file] of remoteManga.files.entries()) {
      if (options?.shouldCancel?.()) {
        throw new Error('下载已取消')
      }

      const blob = await cloudService.fetchWebDavBlob(file.path)

      if (options?.shouldCancel?.()) {
        throw new Error('下载已取消')
      }

      if (downloadTargetService.isAvailable()) {
        const writtenImage = await downloadTargetService.writeImage(remoteManga.title, file.name, file.type, blob)
        outputPath = writtenImage.folderUri || outputPath
        imageRefs.push({
          name: writtenImage.name || file.name,
          type: writtenImage.type || file.type,
          uri: writtenImage.uri,
        })
      } else {
        imageBlobs.push({
          name: file.name,
          type: file.type,
          blob,
        })
      }

      onProgress?.({
        title: remoteManga.title,
        current: index + 1,
        total: remoteManga.files.length,
      })
    }

    if (options?.shouldCancel?.()) {
      throw new Error('下载已取消')
    }

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
