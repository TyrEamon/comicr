import { Capacitor, registerPlugin } from '@capacitor/core'

interface NativeFolderImage {
  name: string
  type: string
  base64: string
}

interface NativeFolderResult {
  title: string
  images: NativeFolderImage[]
}

interface LocalFolderPlugin {
  pickFolder(): Promise<NativeFolderResult>
}

export interface LocalFolderImport {
  title: string
  images: Array<{ name: string; type: string; blob: Blob }>
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

  async pickFolder(): Promise<LocalFolderImport> {
    if (!this.isAvailable()) {
      throw new Error('文件夹导入需要 Android APK 环境')
    }

    const result = await localFolderPlugin.pickFolder()
    return {
      title: result.title,
      images: result.images.map((image) => ({
        name: image.name,
        type: image.type,
        blob: base64ToBlob(image.base64, image.type),
      })),
    }
  },
}
