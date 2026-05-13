const DOWNLOAD_SITE_SETTINGS_KEY = 'comics-app:download-site-settings:v1'

export interface DownloadSiteSettings {
  exhentaiCookie: string
  kemonoCookie: string
  kemonoUseOriginal: boolean
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

function normalizeCookie(value?: string) {
  return (value || '')
    .replace(/^cookie:\s*/i, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*;\s*/g, '; ')
    .trim()
}

function normalizeKemonoCookie(value?: string) {
  const cookie = normalizeCookie(value)
  if (!cookie || cookie.includes('=')) return cookie
  return `session=${cookie}`
}

export const downloadSiteSettings = {
  getSettings(): DownloadSiteSettings {
    const settings = loadJsonRecord<Partial<DownloadSiteSettings>>(DOWNLOAD_SITE_SETTINGS_KEY, {})
    return {
      exhentaiCookie: normalizeCookie(settings.exhentaiCookie),
      kemonoCookie: normalizeKemonoCookie(settings.kemonoCookie),
      kemonoUseOriginal: settings.kemonoUseOriginal === true,
    }
  },

  updateSettings(settings: Partial<DownloadSiteSettings>) {
    const nextSettings = {
      ...this.getSettings(),
      ...settings,
    }
    nextSettings.exhentaiCookie = normalizeCookie(nextSettings.exhentaiCookie)
    nextSettings.kemonoCookie = normalizeKemonoCookie(nextSettings.kemonoCookie)
    localStorage.setItem(DOWNLOAD_SITE_SETTINGS_KEY, JSON.stringify(nextSettings))
    return nextSettings
  },

  clearExhentaiCookie() {
    const nextSettings = {
      ...this.getSettings(),
      exhentaiCookie: '',
    }
    localStorage.setItem(DOWNLOAD_SITE_SETTINGS_KEY, JSON.stringify(nextSettings))
    return nextSettings
  },

  clearKemonoCookie() {
    const nextSettings = {
      ...this.getSettings(),
      kemonoCookie: '',
    }
    localStorage.setItem(DOWNLOAD_SITE_SETTINGS_KEY, JSON.stringify(nextSettings))
    return nextSettings
  },
}
