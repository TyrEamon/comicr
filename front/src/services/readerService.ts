export type ReaderMode = 'gallery' | 'continuous'
export type ReaderFitMode = 'contain' | 'width'
export type ReaderGalleryDirection = 'right-next' | 'left-next'

export interface ReaderPreferences {
  mode: ReaderMode
  fitMode: ReaderFitMode
  galleryDirection: ReaderGalleryDirection
}

const READER_PREFERENCES_KEY = 'comics-app:reader-preferences:v1'

const defaultPreferences: ReaderPreferences = {
  mode: 'gallery',
  fitMode: 'contain',
  galleryDirection: 'right-next',
}

function normalizeMode(mode: unknown): ReaderMode {
  return mode === 'continuous' ? 'continuous' : 'gallery'
}

function normalizeFitMode(mode: unknown): ReaderFitMode {
  return mode === 'width' ? 'width' : 'contain'
}

function normalizeGalleryDirection(direction: unknown): ReaderGalleryDirection {
  return direction === 'left-next' ? 'left-next' : 'right-next'
}

function readPreferences(): ReaderPreferences {
  try {
    const rawValue = localStorage.getItem(READER_PREFERENCES_KEY)
    if (!rawValue) return { ...defaultPreferences }
    const parsed = JSON.parse(rawValue) as Partial<ReaderPreferences>
    return {
      mode: normalizeMode(parsed.mode),
      fitMode: normalizeFitMode(parsed.fitMode),
      galleryDirection: normalizeGalleryDirection(parsed.galleryDirection),
    }
  } catch {
    return { ...defaultPreferences }
  }
}

function writePreferences(preferences: ReaderPreferences) {
  localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(preferences))
}

export const readerService = {
  getPreferences(): ReaderPreferences {
    return readPreferences()
  },

  updatePreferences(nextPreferences: Partial<ReaderPreferences>) {
    const current = readPreferences()
    writePreferences({
      mode: normalizeMode(nextPreferences.mode ?? current.mode),
      fitMode: normalizeFitMode(nextPreferences.fitMode ?? current.fitMode),
      galleryDirection: normalizeGalleryDirection(nextPreferences.galleryDirection ?? current.galleryDirection),
    })
  },
}
