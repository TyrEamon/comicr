import { Capacitor, registerPlugin } from '@capacitor/core'

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
  pages: NativeArchivePage[]
}

interface NativeArchiveReadResult {
  type: string
  base64: string
}

interface NativeArchivePlugin {
  pickArchive(): Promise<NativeArchivePickResult>
  readEntry(options: { uri: string; entryName: string }): Promise<NativeArchiveReadResult>
}

const archivePlugin = registerPlugin<NativeArchivePlugin>('Archive')

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
    return archivePlugin.pickArchive()
  },

  async readEntry(archiveUri: string, entryName: string, fallbackType = 'image/jpeg') {
    const result = await archivePlugin.readEntry({ uri: archiveUri, entryName })
    return base64ToBlob(result.base64, result.type || fallbackType)
  },
}
