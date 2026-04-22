import { Capacitor, registerPlugin } from '@capacitor/core'

const DOWNLOAD_TARGET_KEY = 'comics-app:download-target:v1'

interface NativeDownloadTargetFolder {
  uri: string
  name: string
}

interface NativeDownloadImageResult {
  uri: string
  name: string
  type: string
  folderUri: string
}

interface NativeDownloadTargetPlugin {
  pickFolder(): Promise<NativeDownloadTargetFolder>
  writeImage(options: {
    targetUri?: string
    title: string
    name: string
    type: string
    base64: string
  }): Promise<NativeDownloadImageResult>
}

export interface DownloadTarget {
  uri: string
  name: string
}

const downloadTargetPlugin = registerPlugin<NativeDownloadTargetPlugin>('DownloadTarget')

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.includes(',') ? value.split(',')[1] ?? '' : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取下载图片失败'))
    reader.readAsDataURL(blob)
  })
}

export const downloadTargetService = {
  isAvailable() {
    return Capacitor.getPlatform() === 'android'
  },

  getTarget(): DownloadTarget | null {
    return loadJsonRecord<DownloadTarget | null>(DOWNLOAD_TARGET_KEY, null)
  },

  getTargetLabel() {
    return this.getTarget()?.name || 'Download/Comicr'
  },

  clearTarget() {
    localStorage.removeItem(DOWNLOAD_TARGET_KEY)
  },

  async pickTarget() {
    const target = await downloadTargetPlugin.pickFolder()
    localStorage.setItem(DOWNLOAD_TARGET_KEY, JSON.stringify(target))
    return target
  },

  async writeImage(title: string, name: string, type: string, blob: Blob) {
    const target = this.getTarget()
    const base64 = await blobToBase64(blob)
    return downloadTargetPlugin.writeImage({
      targetUri: target?.uri,
      title,
      name,
      type: type || blob.type || 'image/jpeg',
      base64,
    })
  },
}
