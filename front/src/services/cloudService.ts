import { libraryService } from './libraryService'
import type { CloudFile, ImportResult, ProviderSummary } from './types'

const LOCAL_PROVIDER: ProviderSummary = {
  id: 'local-archive',
  name: 'Local Archive',
  type: 'local',
  connected: true,
  usedBytes: 0,
  totalBytes: 0,
  description: 'Use a local ZIP or CBZ file as the first cloud import path.',
}

const WEBDAV_PROVIDER: ProviderSummary = {
  id: 'webdav',
  name: 'WebDAV',
  type: 'webdav',
  connected: false,
  usedBytes: 0,
  totalBytes: 0,
  description: 'Planned provider for NAS and WebDAV-compatible cloud drives.',
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
        name: 'Import ZIP / CBZ',
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

