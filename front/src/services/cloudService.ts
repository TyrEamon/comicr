import { libraryService } from './libraryService'
import type { CloudFile, ImportResult, ProviderSummary } from './types'

const LOCAL_PROVIDER: ProviderSummary = {
  id: 'local-archive',
  name: '本地导入',
  type: 'local',
  connected: true,
  usedBytes: 0,
  totalBytes: 0,
  description: '使用本地 ZIP 或 CBZ 文件，先打通云盘导入的同一条链路。',
}

const WEBDAV_PROVIDER: ProviderSummary = {
  id: 'webdav',
  name: 'WebDAV',
  type: 'webdav',
  connected: false,
  usedBytes: 0,
  totalBytes: 0,
  description: '计划用于 NAS 和兼容 WebDAV 的云盘。',
}

export const cloudService = {
  async listProviders(): Promise<ProviderSummary[]> {
    return [LOCAL_PROVIDER, WEBDAV_PROVIDER]
  },

  async listFiles(providerId: string): Promise<CloudFile[]> {
    if (providerId !== LOCAL_PROVIDER.id) {
      return []
    }

    return [
      {
        id: 'local-import',
        name: '导入 ZIP / CBZ',
        path: 'local-import',
        isDir: false,
        sizeBytes: 0,
        updatedAt: new Date().toISOString(),
      },
    ]
  },

  async importArchive(file: File): Promise<ImportResult> {
    const manga = await libraryService.importArchive(file, 'cloud')
    return {
      mangaId: manga.id,
      title: manga.title,
      fileCount: manga.imageCount,
    }
  },
}
