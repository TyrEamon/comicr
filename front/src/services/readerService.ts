export type ReaderMode = 'gallery' | 'continuous'
export type ReaderFitMode = 'contain' | 'width'
export type ReaderGalleryDirection = 'right-next' | 'left-next'

export interface ReaderPreferences {
  mode: ReaderMode
  fitMode: ReaderFitMode
  galleryDirection: ReaderGalleryDirection
  pageTurnAnimation: boolean
  textFontSize: number
  textLineHeight: number
  textIndentEm: number
  textParagraphSpacingEm: number
}

const READER_PREFERENCES_KEY = 'comics-app:reader-preferences:v1'

export const readerTextPreferenceLimits = {
  fontSize: { min: 14, max: 26, step: 1, defaultValue: 18 },
  lineHeight: { min: 1.4, max: 2.4, step: 0.05, defaultValue: 1.86 },
  indentEm: { min: 0, max: 2, step: 0.5, defaultValue: 2 },
  paragraphSpacingEm: { min: 0.4, max: 1.8, step: 0.1, defaultValue: 1 },
} as const

const defaultPreferences: ReaderPreferences = {
  mode: 'gallery',
  fitMode: 'contain',
  galleryDirection: 'right-next',
  pageTurnAnimation: true,
  textFontSize: readerTextPreferenceLimits.fontSize.defaultValue,
  textLineHeight: readerTextPreferenceLimits.lineHeight.defaultValue,
  textIndentEm: readerTextPreferenceLimits.indentEm.defaultValue,
  textParagraphSpacingEm: readerTextPreferenceLimits.paragraphSpacingEm.defaultValue,
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

function normalizePageTurnAnimation(value: unknown) {
  return typeof value === 'boolean' ? value : true
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
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
      pageTurnAnimation: normalizePageTurnAnimation(parsed.pageTurnAnimation),
      textFontSize: normalizeNumber(parsed.textFontSize, defaultPreferences.textFontSize, readerTextPreferenceLimits.fontSize.min, readerTextPreferenceLimits.fontSize.max),
      textLineHeight: normalizeNumber(parsed.textLineHeight, defaultPreferences.textLineHeight, readerTextPreferenceLimits.lineHeight.min, readerTextPreferenceLimits.lineHeight.max),
      textIndentEm: normalizeNumber(parsed.textIndentEm, defaultPreferences.textIndentEm, readerTextPreferenceLimits.indentEm.min, readerTextPreferenceLimits.indentEm.max),
      textParagraphSpacingEm: normalizeNumber(parsed.textParagraphSpacingEm, defaultPreferences.textParagraphSpacingEm, readerTextPreferenceLimits.paragraphSpacingEm.min, readerTextPreferenceLimits.paragraphSpacingEm.max),
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
      pageTurnAnimation: normalizePageTurnAnimation(nextPreferences.pageTurnAnimation ?? current.pageTurnAnimation),
      textFontSize: normalizeNumber(nextPreferences.textFontSize ?? current.textFontSize, defaultPreferences.textFontSize, readerTextPreferenceLimits.fontSize.min, readerTextPreferenceLimits.fontSize.max),
      textLineHeight: normalizeNumber(nextPreferences.textLineHeight ?? current.textLineHeight, defaultPreferences.textLineHeight, readerTextPreferenceLimits.lineHeight.min, readerTextPreferenceLimits.lineHeight.max),
      textIndentEm: normalizeNumber(nextPreferences.textIndentEm ?? current.textIndentEm, defaultPreferences.textIndentEm, readerTextPreferenceLimits.indentEm.min, readerTextPreferenceLimits.indentEm.max),
      textParagraphSpacingEm: normalizeNumber(nextPreferences.textParagraphSpacingEm ?? current.textParagraphSpacingEm, defaultPreferences.textParagraphSpacingEm, readerTextPreferenceLimits.paragraphSpacingEm.min, readerTextPreferenceLimits.paragraphSpacingEm.max),
    })
  },
}
