import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeFolderPage {
  name: string
  type: string
  uri?: string
  archiveUri?: string
  entryName?: string
}

type NativeFolderSourceType = 'folder' | 'archive' | 'epub' | 'txt'

interface NativeFolderManga {
  id: string
  title: string
  imageCount: number
  structureType: 'single' | 'nested' | 'chapters' | 'archive' | 'epub' | 'txt'
  sourceType?: NativeFolderSourceType
  sourceKey?: string
  sourceVersionKey?: string
  pages: NativeFolderPage[]
}

interface NativeFolderScanResult {
  rootTitle: string
  rootUri: string
  mangas: NativeFolderManga[]
}

interface NativeImageReadResult {
  type: string
  base64: string
}

interface NativeFileReadResult {
  name: string
  type: string
  base64: string
}

interface NativeFileChunkReadResult {
  name: string
  type: string
  size: number
  offset: number
  nextOffset: number
  base64: string
  done: boolean
}

interface LocalFolderPlugin {
  pickFolder(): Promise<NativeFolderScanResult>
  scanFolder(options: { uri: string }): Promise<NativeFolderScanResult>
  readImage(options: { uri: string }): Promise<NativeImageReadResult>
  readFile(options: { uri: string }): Promise<NativeFileReadResult>
  readFileChunk?: (options: { uri: string; offset: number; length: number }) => Promise<NativeFileChunkReadResult>
}

export interface LocalFolderImport {
  title: string
  sourceType: NativeFolderSourceType
  sourceKey: string
  sourceVersionKey?: string
  images: Array<{ name: string; type: string; uri?: string; archiveUri?: string; entryName?: string }>
  imageCount: number
  structureType: NativeFolderManga['structureType']
}

export interface LocalFolderImportProgress {
  current: number
  total: number
  title: string
}

export interface AuthorizedFolderRoot {
  title: string
  uri: string
  updatedAt: number
}

const localFolderPlugin = registerPlugin<LocalFolderPlugin>('LocalFolder')
const AUTHORIZED_FOLDER_ROOTS_KEY = 'comics-app:authorized-folder-roots:v1'
const READ_FILE_CHUNK_BYTES = 512 * 1024

function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function base64ToBlob(base64: string, type: string) {
  const bytes = base64ToBytes(base64)
  return new Blob([bytes], { type })
}

function yieldToEventLoop() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
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

function saveAuthorizedRoot(scan: NativeFolderScanResult) {
  const roots = loadAuthorizedRoots()
  const nextRoot = {
    title: scan.rootTitle,
    uri: scan.rootUri,
    updatedAt: Date.now(),
  }
  const nextRoots = [nextRoot, ...roots.filter((root) => root.uri !== scan.rootUri)]
  saveJsonRecord(AUTHORIZED_FOLDER_ROOTS_KEY, nextRoots)
  return nextRoot
}

function loadAuthorizedRoots() {
  return loadJsonRecord<AuthorizedFolderRoot[]>(AUTHORIZED_FOLDER_ROOTS_KEY, [])
    .filter((root) => root.uri)
}

function toImports(scan: NativeFolderScanResult, onProgress?: (progress: LocalFolderImportProgress) => void) {
  const imports: LocalFolderImport[] = []
  for (const [index, manga] of scan.mangas.entries()) {
    onProgress?.({
      current: index + 1,
      total: scan.mangas.length,
      title: manga.title,
    })

    const sourceType = manga.sourceType || 'folder'
    imports.push({
      title: manga.title,
      imageCount: manga.imageCount,
      structureType: manga.structureType,
      sourceType,
      sourceKey: manga.sourceKey || `${scan.rootUri}:${manga.title}`,
      sourceVersionKey: manga.sourceVersionKey,
      images: manga.pages.map((image) => ({
        name: image.name,
        type: image.type,
        uri: image.uri,
        archiveUri: image.archiveUri,
        entryName: image.entryName,
      })),
    })
  }
  return imports
}

export const localFolderService = {
  isAvailable() {
    return Capacitor.getPlatform() === 'android'
  },

  getAuthorizedRoots() {
    return loadAuthorizedRoots()
  },

  clearAuthorizedRoot(uri: string) {
    const roots = loadAuthorizedRoots().filter((root) => root.uri !== uri)
    saveJsonRecord(AUTHORIZED_FOLDER_ROOTS_KEY, roots)
    return roots
  },

  async pickFolder(onProgress?: (progress: LocalFolderImportProgress) => void): Promise<LocalFolderImport[]> {
    if (!this.isAvailable()) {
      throw new Error('文件夹导入需要 Android APK 环境')
    }

    const scan = await localFolderPlugin.pickFolder()
    saveAuthorizedRoot(scan)
    if (scan.mangas.length === 0) {
      throw new Error('文件夹里没有识别到漫画')
    }

    return toImports(scan, onProgress)
  },

  async scanAuthorizedFolders(onProgress?: (progress: LocalFolderImportProgress) => void): Promise<LocalFolderImport[]> {
    if (!this.isAvailable()) {
      throw new Error('刷新漫画库需要 Android APK 环境')
    }

    const roots = loadAuthorizedRoots()
    if (roots.length === 0) {
      throw new Error('还没有授权漫画库文件夹')
    }

    const imports: LocalFolderImport[] = []
    for (const [rootIndex, root] of roots.entries()) {
      const scan = await localFolderPlugin.scanFolder({ uri: root.uri })
      saveAuthorizedRoot(scan)
      imports.push(...toImports(scan, (progress) => {
        onProgress?.({
          current: rootIndex + 1,
          total: roots.length,
          title: `${scan.rootTitle} · ${progress.title}`,
        })
      }))
    }
    return imports
  },

  async readImage(uri: string, fallbackType = 'image/jpeg') {
    if (!this.isAvailable()) {
      throw new Error('读取授权图片需要 Android APK 环境')
    }

    const result = await localFolderPlugin.readImage({ uri })
    return base64ToBlob(result.base64, result.type || fallbackType)
  },

  async readFile(uri: string, fallbackType = 'application/octet-stream') {
    if (!this.isAvailable()) {
      throw new Error('读取授权文件需要 Android APK 环境')
    }

    if (localFolderPlugin.readFileChunk) {
      const chunks: Uint8Array[] = []
      let offset = 0
      let name = 'document'
      let type = fallbackType

      for (let chunkIndex = 0; chunkIndex < 20_000; chunkIndex += 1) {
        const result = await localFolderPlugin.readFileChunk({ uri, offset, length: READ_FILE_CHUNK_BYTES })
        name = result.name || name
        type = result.type || type
        if (result.base64) chunks.push(base64ToBytes(result.base64))

        const nextOffset = Number(result.nextOffset || offset)
        if (result.done) break
        if (nextOffset <= offset) {
          throw new Error('读取授权文件失败：文件流没有继续前进')
        }

        offset = nextOffset
        await yieldToEventLoop()
      }

      const blob = new Blob(chunks, { type })
      return new File([blob], name, { type: blob.type || fallbackType })
    }

    const result = await localFolderPlugin.readFile({ uri })
    const blob = base64ToBlob(result.base64, result.type || fallbackType)
    return new File([blob], result.name || 'document', { type: blob.type || fallbackType })
  },
}
