const JM_THREAD_SETTINGS_KEY = 'comics-app:jm-thread-settings:v1'
const DEFAULT_JM_THREAD_COUNT = 4
const MAX_JM_THREAD_COUNT = 8

export interface JmThreadSettings {
  threadCount: number
}

export function clampJmThreadCount(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return DEFAULT_JM_THREAD_COUNT
  return Math.min(MAX_JM_THREAD_COUNT, Math.max(1, Math.round(numberValue)))
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

export const jmThreadSettings = {
  getSettings(): JmThreadSettings {
    const settings = loadJsonRecord<Partial<JmThreadSettings>>(JM_THREAD_SETTINGS_KEY, {})
    return {
      threadCount: clampJmThreadCount(settings.threadCount),
    }
  },

  updateSettings(settings: Partial<JmThreadSettings>) {
    const nextSettings = {
      ...this.getSettings(),
      ...settings,
    }
    nextSettings.threadCount = clampJmThreadCount(nextSettings.threadCount)
    localStorage.setItem(JM_THREAD_SETTINGS_KEY, JSON.stringify(nextSettings))
    return nextSettings
  },
}
