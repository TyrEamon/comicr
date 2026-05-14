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

interface NativeDeleteImagesResult {
  deleted: number
  failed: number
}

interface NativeMetadataResult {
  uri?: string
  name?: string
  text?: string
  deleted?: boolean
}

interface NativeMetadataBlobResult {
  uri?: string
  name?: string
  type?: string
  base64?: string
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
  deleteImages(options: { uris: string[] }): Promise<NativeDeleteImagesResult>
  writeMetadata?(options: { targetUri?: string; name: string; text: string }): Promise<NativeMetadataResult>
  readMetadata?(options: { targetUri?: string; name: string }): Promise<NativeMetadataResult>
  deleteMetadata?(options: { targetUri?: string; name: string }): Promise<NativeMetadataResult>
  writeMetadataBlob?(options: { targetUri?: string; path: string; type: string; base64: string }): Promise<NativeMetadataBlobResult>
  readMetadataBlob?(options: { targetUri?: string; path: string; type: string }): Promise<NativeMetadataBlobResult>
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

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

function notifyDownloadTargetChanged() {
  window.dispatchEvent(new CustomEvent('comicr-download-target-updated'))
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
    notifyDownloadTargetChanged()
  },

  async pickTarget() {
    const target = await downloadTargetPlugin.pickFolder()
    localStorage.setItem(DOWNLOAD_TARGET_KEY, JSON.stringify(target))
    notifyDownloadTargetChanged()
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

  async deleteImages(uris: string[]) {
    if (uris.length === 0) return { deleted: 0, failed: 0 }
    return downloadTargetPlugin.deleteImages({ uris })
  },

  async writeMetadata(name: string, text: string) {
    const target = this.getTarget()
    if (!this.isAvailable() || !target?.uri || !downloadTargetPlugin.writeMetadata) return false

    try {
      await downloadTargetPlugin.writeMetadata({ targetUri: target.uri, name, text })
      return true
    } catch {
      return false
    }
  },

  async readMetadata(name: string) {
    const target = this.getTarget()
    if (!this.isAvailable() || !target?.uri || !downloadTargetPlugin.readMetadata) return null

    try {
      const result = await downloadTargetPlugin.readMetadata({ targetUri: target.uri, name })
      return typeof result.text === 'string' ? result.text : null
    } catch {
      return null
    }
  },

  async deleteMetadata(name: string) {
    const target = this.getTarget()
    if (!this.isAvailable() || !target?.uri || !downloadTargetPlugin.deleteMetadata) return false

    try {
      const result = await downloadTargetPlugin.deleteMetadata({ targetUri: target.uri, name })
      return Boolean(result.deleted)
    } catch {
      return false
    }
  },

  async writeMetadataBlob(path: string, type: string, blob: Blob) {
    const target = this.getTarget()
    if (!this.isAvailable() || !target?.uri || !downloadTargetPlugin.writeMetadataBlob) return false

    try {
      await downloadTargetPlugin.writeMetadataBlob({
        targetUri: target.uri,
        path,
        type: type || blob.type || 'application/octet-stream',
        base64: await blobToBase64(blob),
      })
      return true
    } catch {
      return false
    }
  },

  async readMetadataBlob(path: string, type: string) {
    const target = this.getTarget()
    if (!this.isAvailable() || !target?.uri || !downloadTargetPlugin.readMetadataBlob) return null

    try {
      const result = await downloadTargetPlugin.readMetadataBlob({
        targetUri: target.uri,
        path,
        type,
      })
      return result.base64 ? base64ToBlob(result.base64, result.type || type || 'application/octet-stream') : null
    } catch {
      return null
    }
  },
}
