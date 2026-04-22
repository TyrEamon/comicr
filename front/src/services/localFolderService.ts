import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeFolderPage {
  name: string
  type: string
  uri: string
}

interface NativeFolderManga {
  id: string
  title: string
  imageCount: number
  structureType: 'single' | 'nested' | 'chapters'
  pages: NativeFolderPage[]
}

interface NativeFolderScanResult {
  rootTitle: string
  mangas: NativeFolderManga[]
}

interface NativeImageReadResult {
  type: string
  base64: string
}

interface LocalFolderPlugin {
  pickFolder(): Promise<NativeFolderScanResult>
  readImage(options: { uri: string }): Promise<NativeImageReadResult>
}

export interface LocalFolderImport {
  title: string
  images: Array<{ name: string; type: string; uri: string }>
  imageCount: number
  structureType: NativeFolderManga['structureType']
}

export interface LocalFolderImportProgress {
  current: number
  total: number
  title: string
}

const localFolderPlugin = registerPlugin<LocalFolderPlugin>('LocalFolder')

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

export const localFolderService = {
  isAvailable() {
    return Capacitor.getPlatform() === 'android'
  },

  async pickFolder(onProgress?: (progress: LocalFolderImportProgress) => void): Promise<LocalFolderImport[]> {
    if (!this.isAvailable()) {
      throw new Error('文件夹导入需要 Android APK 环境')
    }

    const scan = await localFolderPlugin.pickFolder()
    if (scan.mangas.length === 0) {
      throw new Error('文件夹里没有识别到漫画')
    }

    const imports: LocalFolderImport[] = []
    for (const [index, manga] of scan.mangas.entries()) {
      onProgress?.({
        current: index + 1,
        total: scan.mangas.length,
        title: manga.title,
      })

      imports.push({
        title: manga.title,
        imageCount: manga.imageCount,
        structureType: manga.structureType,
        images: manga.pages.map((image) => ({
          name: image.name,
          type: image.type,
          uri: image.uri,
        })),
      })
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
}
