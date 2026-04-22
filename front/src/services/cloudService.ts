import type { CloudFile, ProviderSummary } from './types'

const LOCAL_PROVIDER: ProviderSummary = {
  id: 'local-archive',
  name: '本地导入',
  type: 'local',
  connected: true,
  usedBytes: 0,
  totalBytes: 0,
  description: '本地漫画导入放在设置页；云盘页后续接 WebDAV。',
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
        name: '设置里的漫画导入',
        path: 'local-import',
        isDir: false,
        sizeBytes: 0,
        updatedAt: new Date().toISOString(),
      },
    ]
  },

}
