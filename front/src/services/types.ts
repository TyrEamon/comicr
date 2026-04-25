export type MangaSource = 'archive' | 'download' | 'cloud' | 'folder' | 'epub' | 'txt' | 'sample'
export type ReaderAssetKind = 'image' | 'text'

export interface ReaderChapter {
  id: string
  index: number
  title: string
  pageIndex: number
  href?: string
}

export interface MangaItem {
  id: string
  title: string
  author?: string
  cover?: string
  localPath: string
  imageCount: number
  source: MangaSource
  addedAt: number
  updatedAt: number
}

export interface MangaImageRecord {
  id: string
  mangaId: string
  index: number
  name: string
  type: string
  kind?: ReaderAssetKind
  html?: string
  chapterTitle?: string
  chapterHref?: string
  chapterIndex?: number
  blob?: Blob
  uri?: string
  archiveUri?: string
  archiveEntryName?: string
}

export interface ImageAsset {
  id: string
  index: number
  name: string
  type: string
  kind?: ReaderAssetKind
  html?: string
  chapterTitle?: string
  chapterHref?: string
  chapterIndex?: number
  src: string
  uri?: string
  archiveUri?: string
  archiveEntryName?: string
  remotePath?: string
}

export interface ShelfState {
  favorite: boolean
  readLater: boolean
  pinned: boolean
  updatedAt: number
}

export interface ReadingProgress {
  mangaId: string
  lastIndex: number
  totalImages: number
  progressPercent: number
  updatedAt: number
}

export type DownloadStatus = 'pending' | 'parsing' | 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface DownloadTask {
  id: string
  url: string
  name: string
  source?: 'link' | 'webdav' | 'jm' | 'telegraph' | 'ehentai' | 'exhentai' | 'nhentai' | 'hitomi' | 'wnacg'
  remotePath?: string
  outputPath?: string
  status: DownloadStatus
  error?: string
  phase?: string
  current: number
  total: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  mangaId?: string
}

export interface ProviderSummary {
  id: string
  name: string
  type: string
  connected: boolean
  usedBytes: number
  totalBytes: number
  description: string
}

export interface CloudFile {
  id: string
  name: string
  path: string
  isDir: boolean
  sizeBytes: number
  updatedAt: string
}

export interface ImportResult {
  mangaId: string
  title: string
  fileCount: number
}

export interface WebDavConfig {
  endpointUrl: string
  username: string
  password: string
  libraryPath: string
}

export interface CloudMangaItem {
  id: string
  title: string
  path: string
  updatedAt: string
  sizeBytes: number
  imageCount: number
  coverUrl: string
}

export interface CloudCacheSettings {
  maxBytes: number
}

export interface CloudCacheStats {
  usedBytes: number
  pageBytes: number
  coverBytes: number
  pageCount: number
  coverCount: number
}
