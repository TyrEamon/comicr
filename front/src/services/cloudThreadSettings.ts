const CLOUD_THREAD_SETTINGS_KEY = 'comics-app:cloud-thread-settings:v1'
const LEGACY_DOWNLOAD_SETTINGS_KEY = 'comics-app:download-settings:v1'
const DEFAULT_CLOUD_THREAD_COUNT = 1
const MAX_CLOUD_THREAD_COUNT = 4

export interface CloudThreadSettings {
  threadCount: number
}

export function clampCloudThreadCount(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return DEFAULT_CLOUD_THREAD_COUNT
  return Math.min(MAX_CLOUD_THREAD_COUNT, Math.max(1, Math.round(numberValue)))
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

export const cloudThreadSettings = {
  getSettings(): CloudThreadSettings {
    const settings = loadJsonRecord<Partial<CloudThreadSettings>>(CLOUD_THREAD_SETTINGS_KEY, {})
    const legacySettings = loadJsonRecord<{ concurrency?: number }>(LEGACY_DOWNLOAD_SETTINGS_KEY, {})
    return {
      threadCount: clampCloudThreadCount(settings.threadCount ?? legacySettings.concurrency),
    }
  },

  updateSettings(settings: Partial<CloudThreadSettings>) {
    const nextSettings = {
      ...this.getSettings(),
      ...settings,
    }
    nextSettings.threadCount = clampCloudThreadCount(nextSettings.threadCount)
    localStorage.setItem(CLOUD_THREAD_SETTINGS_KEY, JSON.stringify(nextSettings))
    return nextSettings
  },
}
