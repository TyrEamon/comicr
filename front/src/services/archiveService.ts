import { Capacitor, registerPlugin } from '@capacitor/core'
import { normalizeArchiveError } from './archiveErrors'

interface NativeArchivePage {
  name: string
  type: string
  archiveUri: string
  entryName: string
}

interface NativeArchivePickResult {
  title: string
  archiveUri: string
  imageCount: number
  partial?: boolean
  warning?: string
  pages: NativeArchivePage[]
}

interface NativeArchivePickManyResult {
  archives: NativeArchivePickResult[]
  errors?: Array<{ title?: string; message: string }>
}

interface NativeArchiveReadResult {
  type: string
  base64: string
}

interface NativeArchivePlugin {
  pickArchive(): Promise<NativeArchivePickResult>
  pickArchives(): Promise<NativeArchivePickManyResult>
  readEntry(options: { uri: string; entryName: string }): Promise<NativeArchiveReadResult>
}

const archivePlugin = registerPlugin<NativeArchivePlugin>('Archive')
const ARCHIVE_ENTRY_AUTHORITY = 'com.tyr.comicsapp.archive'

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

export const archiveService = {
  isAvailable() {
    return Capacitor.getPlatform() === 'android'
  },

  async pickArchive() {
    try {
      return await archivePlugin.pickArchive()
    } catch (error) {
      throw normalizeArchiveError(error, '索引压缩包')
    }
  },

  async pickArchives() {
    try {
      return await archivePlugin.pickArchives()
    } catch (error) {
      throw normalizeArchiveError(error, '索引压缩包')
    }
  },

  entryContentSrc(archiveUri: string, entryName: string) {
    if (Capacitor.getPlatform() !== 'android') return ''

    const contentUri = `content://${ARCHIVE_ENTRY_AUTHORITY}/page/${base64UrlEncode(archiveUri)}/${base64UrlEncode(entryName)}`
    return Capacitor.convertFileSrc(contentUri)
  },

  async readEntry(archiveUri: string, entryName: string, fallbackType = 'image/jpeg') {
    try {
      const result = await archivePlugin.readEntry({ uri: archiveUri, entryName })
      return base64ToBlob(result.base64, result.type || fallbackType)
    } catch (error) {
      throw normalizeArchiveError(error, '读取压缩包页面')
    }
  },
}
