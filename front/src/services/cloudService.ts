import { deleteRecord, getAllRecords, getRecord, putRecord } from './db'
import { cloudThreadSettings } from './cloudThreadSettings'
import { downloadTargetService } from './downloadTargetService'
import { networkProxySettings, type NativeProxyConfig } from './networkProxySettings'
import type {
  CloudCacheSettings,
  CloudCacheStats,
  CloudFile,
  CloudMangaItem,
  ImageAsset,
  MangaItem,
  ProviderSummary,
  WebDavConfig,
} from './types'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

const WEBDAV_CONFIG_KEY = 'comics-app:webdav-config:v1'
const WEBDAV_PREVIEW_KEY = 'comics-app:webdav-preview:v1'
const WEBDAV_INDEX_KEY = 'comics-app:webdav-index:v1'
const CLOUD_CACHE_SETTINGS_KEY = 'comics-app:cloud-cache-settings:v1'
const WEBDAV_PRIVATE_ROOT = 'webdav-library'
const WEBDAV_PRIVATE_INDEX_PATH = `${WEBDAV_PRIVATE_ROOT}/index.json`
const WEBDAV_PRIVATE_PREVIEWS_PATH = `${WEBDAV_PRIVATE_ROOT}/previews.json`
const WEBDAV_PRIVATE_COVER_DIR = `${WEBDAV_PRIVATE_ROOT}/covers`
const WEBDAV_TARGET_INDEX_FILE = '.comicr-webdav-index.json'
const WEBDAV_TARGET_PREVIEWS_FILE = '.comicr-webdav-previews.json'
const WEBDAV_TARGET_COVER_DIR = '.comicr-webdav-covers'
const WEBDAV_REMOTE_BACKUP_DIR = '.comicr-backup'
const WEBDAV_REMOTE_INDEX_PATH = `${WEBDAV_REMOTE_BACKUP_DIR}/index.json`
const WEBDAV_REMOTE_PREVIEWS_PATH = `${WEBDAV_REMOTE_BACKUP_DIR}/previews.json`
const WEBDAV_REMOTE_COVER_DIR = `${WEBDAV_REMOTE_BACKUP_DIR}/covers`
const LOCAL_PROVIDER_ID = 'local-archive'
const WEBDAV_PROVIDER_ID = 'webdav'
const DEFAULT_CLOUD_CACHE_BYTES = 300 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const coverObjectUrls = new Map<string, string>()
const pageObjectUrls = new Map<string, string>()
const WEBDAV_RETRY_DELAYS_MS = [450, 1200, 2400]
const WEBDAV_RETRY_STATUSES = new Set([429, 500, 502, 503, 504])

interface WebDavEntry {
  name: string
  path: string
  isDir: boolean
  sizeBytes: number
  updatedAt: string
}

interface WebDavImageFile extends WebDavEntry {
  type: string
}

interface WebDavMangaIndexProgress {
  current: number
  total: number
  title: string
}

interface CloudCoverCacheRecord {
  id: string
  blob: Blob
  updatedAt: number
  sizeBytes?: number
}

interface WebDavPreviewRecord {
  imageCount: number
  firstImagePath?: string
  coverFilePath?: string
  targetCoverPath?: string
  webDavCoverPath?: string
  coverType?: string
  coverSizeBytes?: number
  coverUpdatedAt?: number
}

interface WebDavIndexRecord {
  items: Array<Omit<CloudMangaItem, 'coverUrl'>>
  syncedAt: number
}

interface WebDavMetadataSyncResult {
  mangaCount: number
  previewCount: number
}

interface CloudPageCacheRecord {
  id: string
  mangaPath: string
  filePath: string
  name: string
  type: string
  index: number
  blob: Blob
  sizeBytes: number
  updatedAt: number
  lastAccessedAt: number
}

interface NativeWebDavPropfindResult {
  status: number
  data: string
}

interface NativeWebDavFileResult {
  status: number
  mimeType: string
  base64: string
}

interface NativeWebDavWriteResult {
  status: number
  data: string
}

interface NativeWebDavPlugin {
  propfind(options: {
    url: string
    authorization: string
    depth: string
    body: string
    proxy?: NativeProxyConfig
  }): Promise<NativeWebDavPropfindResult>
  getFile(options: {
    url: string
    authorization: string
    proxy?: NativeProxyConfig
  }): Promise<NativeWebDavFileResult>
  putFile?(options: {
    url: string
    authorization: string
    contentType: string
    base64: string
    proxy?: NativeProxyConfig
  }): Promise<NativeWebDavWriteResult>
  mkcol?(options: {
    url: string
    authorization: string
    proxy?: NativeProxyConfig
  }): Promise<NativeWebDavWriteResult>
}

const nativeWebDav = registerPlugin<NativeWebDavPlugin>('WebDav')
const WEBDAV_PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontentlength/><getlastmodified/><resourcetype/></prop></propfind>'

function normalizeEndpointUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parsed = new URL(trimmed)
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/`
  return parsed.toString()
}

function normalizeRelativePath(value: string) {
  const segments = value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  return segments.length > 0 ? `/${segments.join('/')}` : ''
}

function normalizeConfig(config: WebDavConfig): WebDavConfig {
  return {
    endpointUrl: normalizeEndpointUrl(config.endpointUrl),
    username: config.username.trim(),
    password: config.password,
    libraryPath: normalizeRelativePath(config.libraryPath),
  }
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

function saveJsonRecord<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

function canUsePrivateFiles() {
  return Capacitor.getPlatform() !== 'web'
}

function storageSafeName(value: string) {
  const normalized = normalizeRelativePath(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  const encoded = btoa(unescape(encodeURIComponent(normalized)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `${hash.toString(16).padStart(8, '0')}-${encoded.slice(0, 96)}`
}

function privateCoverPath(path: string) {
  return `${WEBDAV_PRIVATE_COVER_DIR}/${storageSafeName(path)}.bin`
}

function targetCoverPath(path: string) {
  return `${WEBDAV_TARGET_COVER_DIR}/${storageSafeName(path)}.bin`
}

function webDavCoverPath(path: string) {
  return `${WEBDAV_REMOTE_COVER_DIR}/${storageSafeName(path)}.bin`
}

function privateParentPath(path: string) {
  const index = path.lastIndexOf('/')
  return index > 0 ? path.slice(0, index) : ''
}

async function ensurePrivateDirectory(path: string) {
  if (!canUsePrivateFiles() || !path) return false
  try {
    await Filesystem.mkdir({
      path,
      directory: Directory.Data,
      recursive: true,
    })
    return true
  } catch {
    return true
  }
}

async function readPrivateJsonRecord<T>(path: string): Promise<T | null> {
  if (!canUsePrivateFiles()) return null
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    })
    const text = typeof result.data === 'string' ? result.data : await result.data.text()
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

async function writePrivateJsonRecord<T>(path: string, value: T) {
  if (!canUsePrivateFiles()) return false
  try {
    await ensurePrivateDirectory(privateParentPath(path))
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: JSON.stringify(value),
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return true
  } catch {
    return false
  }
}

async function readTargetJsonRecord<T>(name: string): Promise<T | null> {
  try {
    const text = await downloadTargetService.readMetadata(name)
    return text ? JSON.parse(text) as T : null
  } catch {
    return null
  }
}

async function writeTargetJsonRecord<T>(name: string, value: T) {
  try {
    return await downloadTargetService.writeMetadata(name, JSON.stringify(value))
  } catch {
    return false
  }
}

async function deleteTargetMetadata(name: string) {
  try {
    await downloadTargetService.deleteMetadata(name)
  } catch {
    // The backup file is best-effort and may not exist if no download folder is configured.
  }
}

async function deletePrivateFile(path: string) {
  if (!canUsePrivateFiles()) return
  try {
    await Filesystem.deleteFile({
      path,
      directory: Directory.Data,
    })
  } catch {
    // The file may already be gone if Android reclaimed app data or the user cleared storage.
  }
}

async function deletePrivateDirectory(path: string) {
  if (!canUsePrivateFiles()) return
  try {
    await Filesystem.rmdir({
      path,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // Missing directories are fine here; the cache UI should stay idempotent.
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function readPrivateBlob(path: string, type: string) {
  if (!canUsePrivateFiles()) return null
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    })
    const base64 = typeof result.data === 'string'
      ? result.data
      : await blobToBase64(result.data)
    return base64ToBlob(base64.includes(',') ? base64.split(',')[1] : base64, type)
  } catch {
    return null
  }
}

async function writePrivateBlob(path: string, blob: Blob) {
  if (!canUsePrivateFiles()) return false
  try {
    await ensurePrivateDirectory(privateParentPath(path))
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: await blobToBase64(blob),
      recursive: true,
    })
    return true
  } catch {
    return false
  }
}

async function readTargetBlob(path: string, type: string) {
  try {
    return await downloadTargetService.readMetadataBlob(path, type)
  } catch {
    return null
  }
}

async function writeTargetBlob(path: string, blob: Blob) {
  try {
    return await downloadTargetService.writeMetadataBlob(path, blob.type || 'application/octet-stream', blob)
  } catch {
    return false
  }
}

function loadWebDavConfig(): WebDavConfig | null {
  const stored = loadJsonRecord<WebDavConfig | null>(WEBDAV_CONFIG_KEY, null)
  if (!stored) return null

  try {
    const normalized = normalizeConfig(stored)
    if (!normalized.endpointUrl || !normalized.username) return null
    return normalized
  } catch {
    return null
  }
}

function saveWebDavConfig(config: WebDavConfig) {
  const normalized = normalizeConfig(config)
  if (!normalized.endpointUrl) {
    throw new Error('请填写 WebDAV 地址')
  }
  if (!normalized.username) {
    throw new Error('请填写 WebDAV 用户名')
  }
  if (!normalized.password) {
    throw new Error('请填写 WebDAV 密码')
  }
  localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(normalized))
}

function clearWebDavConfig() {
  localStorage.removeItem(WEBDAV_CONFIG_KEY)
}

function loadPreviewCache() {
  if (isMetadataTargetOnly()) return previewCacheMemory ?? {}
  return loadJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_PREVIEW_KEY, {})
}

function savePreviewCache(cache: Record<string, WebDavPreviewRecord>) {
  if (isMetadataTargetOnly()) {
    previewCacheMemory = cache
    localStorage.removeItem(WEBDAV_PREVIEW_KEY)
    return
  }
  saveJsonRecord(WEBDAV_PREVIEW_KEY, cache)
}

let previewPrivateWriteQueue = Promise.resolve()
let indexPrivateWriteQueue = Promise.resolve()
let previewCacheHydrated = false
let indexCacheHydrated = false
let previewCacheHydrationPromise: Promise<void> | null = null
let indexCacheHydrationPromise: Promise<void> | null = null
let previewCacheMemory: Record<string, WebDavPreviewRecord> | null = null
let indexCacheMemory: WebDavIndexRecord | null = null

function isMetadataTargetOnly() {
  return loadCloudCacheSettings().metadataTargetOnly
}

function writePreviewCachePrivate(cache: Record<string, WebDavPreviewRecord>) {
  const snapshot = JSON.parse(JSON.stringify(cache)) as Record<string, WebDavPreviewRecord>
  previewPrivateWriteQueue = previewPrivateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (isMetadataTargetOnly()) {
        await writeTargetJsonRecord(WEBDAV_TARGET_PREVIEWS_FILE, snapshot)
        return
      }

      await Promise.all([
        writePrivateJsonRecord(WEBDAV_PRIVATE_PREVIEWS_PATH, snapshot),
        writeTargetJsonRecord(WEBDAV_TARGET_PREVIEWS_FILE, snapshot),
      ])
    })
    .then(() => undefined)
  return previewPrivateWriteQueue
}

async function ensurePreviewCacheHydrated() {
  if (previewCacheHydrated) return
  if (previewCacheHydrationPromise) {
    await previewCacheHydrationPromise
    return
  }

  previewCacheHydrationPromise = (async () => {
    const storedCache = isMetadataTargetOnly()
      ? await readTargetJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_TARGET_PREVIEWS_FILE)
      : await readPrivateJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_PRIVATE_PREVIEWS_PATH)
        ?? await readTargetJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_TARGET_PREVIEWS_FILE)
    if (storedCache) {
      savePreviewCache(storedCache)
      void writePreviewCachePrivate(storedCache)
      previewCacheHydrated = true
      return
    }

    const localCache = loadPreviewCache()
    if (Object.keys(localCache).length > 0) {
      void writePreviewCachePrivate(localCache)
    }
    previewCacheHydrated = true
  })()

  await previewCacheHydrationPromise
}

async function loadPreviewCacheAsync() {
  await ensurePreviewCacheHydrated()
  const cache = loadPreviewCache()
  if (Object.keys(cache).length > 0) return cache

  const targetCache = await readTargetJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_TARGET_PREVIEWS_FILE)
  if (!targetCache || typeof targetCache !== 'object' || Array.isArray(targetCache)) return cache

  savePreviewCache(targetCache)
  void writePreviewCachePrivate(targetCache)
  return targetCache
}

function loadIndexCache(): WebDavIndexRecord {
  if (isMetadataTargetOnly()) return indexCacheMemory ?? { items: [], syncedAt: 0 }
  return loadJsonRecord<WebDavIndexRecord>(WEBDAV_INDEX_KEY, { items: [], syncedAt: 0 })
}

function toIndexRecord(items: CloudMangaItem[]): WebDavIndexRecord {
  return {
    items: items.map(({ coverUrl, ...item }) => item),
    syncedAt: Date.now(),
  }
}

function saveIndexRecord(record: WebDavIndexRecord) {
  if (isMetadataTargetOnly()) {
    indexCacheMemory = record
    localStorage.removeItem(WEBDAV_INDEX_KEY)
    return
  }
  saveJsonRecord(WEBDAV_INDEX_KEY, record)
}

function writeIndexCachePrivate(record: WebDavIndexRecord) {
  const snapshot = JSON.parse(JSON.stringify(record)) as WebDavIndexRecord
  indexPrivateWriteQueue = indexPrivateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (isMetadataTargetOnly()) {
        await writeTargetJsonRecord(WEBDAV_TARGET_INDEX_FILE, snapshot)
        return
      }

      await Promise.all([
        writePrivateJsonRecord(WEBDAV_PRIVATE_INDEX_PATH, snapshot),
        writeTargetJsonRecord(WEBDAV_TARGET_INDEX_FILE, snapshot),
      ])
    })
    .then(() => undefined)
  return indexPrivateWriteQueue
}

async function ensureIndexCacheHydrated() {
  if (indexCacheHydrated) return
  if (indexCacheHydrationPromise) {
    await indexCacheHydrationPromise
    return
  }

  indexCacheHydrationPromise = (async () => {
    const storedRecord = isMetadataTargetOnly()
      ? await readTargetJsonRecord<WebDavIndexRecord>(WEBDAV_TARGET_INDEX_FILE)
      : await readPrivateJsonRecord<WebDavIndexRecord>(WEBDAV_PRIVATE_INDEX_PATH)
        ?? await readTargetJsonRecord<WebDavIndexRecord>(WEBDAV_TARGET_INDEX_FILE)
    if (storedRecord) {
      saveIndexRecord(storedRecord)
      void writeIndexCachePrivate(storedRecord)
      indexCacheHydrated = true
      return
    }

    const localRecord = loadIndexCache()
    if (localRecord.items.length > 0) {
      void writeIndexCachePrivate(localRecord)
    }
    indexCacheHydrated = true
  })()

  await indexCacheHydrationPromise
}

async function loadIndexCacheAsync() {
  await ensureIndexCacheHydrated()
  const cache = loadIndexCache()
  if (cache.items.length > 0) return cache

  const targetRecord = await readTargetJsonRecord<WebDavIndexRecord>(WEBDAV_TARGET_INDEX_FILE)
  if (!targetRecord || !Array.isArray(targetRecord.items)) return cache

  saveIndexRecord(targetRecord)
  void writeIndexCachePrivate(targetRecord)
  return targetRecord
}

async function syncMetadataFromDownloadTarget(): Promise<WebDavMetadataSyncResult> {
  const [targetRecord, targetPreviewCache] = await Promise.all([
    readTargetJsonRecord<WebDavIndexRecord>(WEBDAV_TARGET_INDEX_FILE),
    readTargetJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_TARGET_PREVIEWS_FILE),
  ])

  const hasIndex = Boolean(targetRecord && Array.isArray(targetRecord.items))
  const hasPreviews = Boolean(targetPreviewCache && typeof targetPreviewCache === 'object' && !Array.isArray(targetPreviewCache))
  if (!hasIndex && !hasPreviews) {
    throw new Error('下载目录里没有找到云盘备份索引')
  }

  if (hasIndex && targetRecord) {
    saveIndexRecord(targetRecord)
    void writeIndexCachePrivate(targetRecord)
  }

  if (hasPreviews && targetPreviewCache) {
    savePreviewCache(targetPreviewCache)
    void writePreviewCachePrivate(targetPreviewCache)
  }

  previewCacheHydrated = true
  indexCacheHydrated = true
  previewCacheHydrationPromise = null
  indexCacheHydrationPromise = null

  return {
    mangaCount: hasIndex && targetRecord ? targetRecord.items.length : 0,
    previewCount: hasPreviews && targetPreviewCache ? Object.keys(targetPreviewCache).length : 0,
  }
}

async function readLocalCoverBlobForBackup(record: WebDavPreviewRecord) {
  const coverType = record.coverType || 'image/jpeg'
  if (!isMetadataTargetOnly() && record.coverFilePath) {
    const privateBlob = await readPrivateBlob(record.coverFilePath, coverType)
    if (privateBlob) return privateBlob
  }

  if (record.targetCoverPath) {
    const targetBlob = await readTargetBlob(record.targetCoverPath, coverType)
    if (targetBlob) return targetBlob
  }

  return null
}

async function uploadMetadataToWebDavBackup(): Promise<WebDavMetadataSyncResult> {
  const [indexRecord, previewCache] = await Promise.all([
    loadIndexCacheAsync(),
    loadPreviewCacheAsync(),
  ])
  if (indexRecord.items.length === 0 && Object.keys(previewCache).length === 0) {
    throw new Error('当前还没有可上传的云盘备份索引')
  }

  await ensureWebDavDirectory(WEBDAV_REMOTE_COVER_DIR)
  const nextPreviewCache = JSON.parse(JSON.stringify(previewCache)) as Record<string, WebDavPreviewRecord>

  for (const [path, record] of Object.entries(nextPreviewCache)) {
    const blob = await readLocalCoverBlobForBackup(record)
    if (!blob) continue

    const remotePath = record.webDavCoverPath || webDavCoverPath(path)
    await writeWebDavBlob(remotePath, blob, record.coverType || blob.type || 'image/jpeg')
    nextPreviewCache[path] = {
      ...record,
      webDavCoverPath: remotePath,
      coverType: record.coverType || blob.type || 'image/jpeg',
      coverSizeBytes: record.coverSizeBytes || blob.size,
      coverUpdatedAt: record.coverUpdatedAt || Date.now(),
    }
  }

  await Promise.all([
    writeWebDavJsonRecord(WEBDAV_REMOTE_INDEX_PATH, indexRecord),
    writeWebDavJsonRecord(WEBDAV_REMOTE_PREVIEWS_PATH, nextPreviewCache),
  ])

  savePreviewCache(nextPreviewCache)
  void writePreviewCachePrivate(nextPreviewCache)

  return {
    mangaCount: indexRecord.items.length,
    previewCount: Object.keys(nextPreviewCache).length,
  }
}

async function syncMetadataFromWebDavBackup(): Promise<WebDavMetadataSyncResult> {
  const [indexRecord, previewCache] = await Promise.all([
    readWebDavJsonRecord<WebDavIndexRecord>(WEBDAV_REMOTE_INDEX_PATH),
    readWebDavJsonRecord<Record<string, WebDavPreviewRecord>>(WEBDAV_REMOTE_PREVIEWS_PATH),
  ])

  const hasIndex = Boolean(indexRecord && Array.isArray(indexRecord.items))
  const hasPreviews = Boolean(previewCache && typeof previewCache === 'object' && !Array.isArray(previewCache))
  if (!hasIndex && !hasPreviews) {
    throw new Error('WebDAV 云端没有找到 Comicr 备份目录')
  }

  if (hasIndex && indexRecord) {
    saveIndexRecord(indexRecord)
    void writeIndexCachePrivate(indexRecord)
  }

  if (hasPreviews && previewCache) {
    savePreviewCache(previewCache)
    void writePreviewCachePrivate(previewCache)
  }

  previewCacheHydrated = true
  indexCacheHydrated = true
  previewCacheHydrationPromise = null
  indexCacheHydrationPromise = null

  return {
    mangaCount: hasIndex && indexRecord ? indexRecord.items.length : 0,
    previewCount: hasPreviews && previewCache ? Object.keys(previewCache).length : 0,
  }
}

function resetWebDavMetadataHydration() {
  previewCacheHydrated = false
  indexCacheHydrated = false
  previewCacheHydrationPromise = null
  indexCacheHydrationPromise = null
  previewCacheMemory = null
  indexCacheMemory = null
  void hydrateWebDavPrivateMetadata()
}

async function saveIndexCache(items: CloudMangaItem[]) {
  const record = toIndexRecord(items)
  saveIndexRecord(record)
  await writeIndexCachePrivate(record)
}

function clearIndexCache() {
  localStorage.removeItem(WEBDAV_INDEX_KEY)
  indexCacheHydrated = true
  indexCacheHydrationPromise = null
  void deletePrivateFile(WEBDAV_PRIVATE_INDEX_PATH)
  void deleteTargetMetadata(WEBDAV_TARGET_INDEX_FILE)
}

async function getPreviewRecordAsync(path: string) {
  return (await loadPreviewCacheAsync())[path]
}

async function setPreviewRecord(path: string, record: WebDavPreviewRecord) {
  const cache = loadPreviewCache()
  cache[path] = record
  savePreviewCache(cache)
  await writePreviewCachePrivate(cache)
}

async function clearPreviewCoverRecords() {
  const cache = await loadPreviewCacheAsync()
  const nextCache = Object.fromEntries(
    Object.entries(cache).map(([path, record]) => [path, {
      imageCount: record.imageCount,
      firstImagePath: record.firstImagePath,
    }]),
  ) as Record<string, WebDavPreviewRecord>
  savePreviewCache(nextCache)
  await writePreviewCachePrivate(nextCache)
}

async function hydrateWebDavPrivateMetadata() {
  await Promise.all([
    ensureIndexCacheHydrated(),
    ensurePreviewCacheHydrated(),
  ])
}

void hydrateWebDavPrivateMetadata()

window.addEventListener('comicr-download-target-updated', resetWebDavMetadataHydration)

function cleanFolderTitle(path: string) {
  const segments = path.split('/').filter(Boolean)
  return decodeURIComponent(segments[segments.length - 1] ?? path ?? '未命名漫画')
}

function extensionOf(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index).toLowerCase() : ''
}

function mimeFromName(name: string) {
  switch (extensionOf(name)) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}

function isImageName(name: string) {
  return IMAGE_EXTENSIONS.has(extensionOf(name))
}

function isCoverImageName(name: string) {
  return /^(cover|folder|thumb|thumbnail)\.[^.]+$/i.test(name.trim())
}

function isWebDavBackupPath(path: string) {
  const normalized = normalizeRelativePath(path)
  return normalized === `/${WEBDAV_REMOTE_BACKUP_DIR}` || normalized.startsWith(`/${WEBDAV_REMOTE_BACKUP_DIR}/`)
}

function encodeBasicAuth(username: string, password: string) {
  return `Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`
}

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

function normalizeCacheSettings(settings?: Partial<CloudCacheSettings>): CloudCacheSettings {
  const rawBytes = Number(settings?.maxBytes)
  const maxBytes = Number.isFinite(rawBytes) && rawBytes > 0
    ? Math.max(50 * 1024 * 1024, Math.round(rawBytes))
    : DEFAULT_CLOUD_CACHE_BYTES
  return {
    maxBytes,
    metadataTargetOnly: settings?.metadataTargetOnly === true,
  }
}

function loadCloudCacheSettings() {
  return normalizeCacheSettings(loadJsonRecord<Partial<CloudCacheSettings>>(CLOUD_CACHE_SETTINGS_KEY, {}))
}

function saveCloudCacheSettings(settings: Partial<CloudCacheSettings>) {
  saveJsonRecord(CLOUD_CACHE_SETTINGS_KEY, normalizeCacheSettings(settings))
}

function webDavPageCacheId(mangaPath: string, filePath: string) {
  return `webdav-page:${normalizeRelativePath(mangaPath)}:${normalizeRelativePath(filePath)}`
}

function isPageCacheRecord(record: { id?: string }): record is CloudPageCacheRecord {
  return Boolean(record.id?.startsWith('webdav-page:'))
}

function isCoverCacheRecord(record: { id?: string }): record is CloudCoverCacheRecord {
  return Boolean(record.id?.startsWith('webdav-cover:'))
}

function isAndroidNative() {
  return Capacitor.getPlatform() === 'android'
}

function nativeProxyOption() {
  const proxy = networkProxySettings.getNativeProxy()
  return proxy ? { proxy } : {}
}

function wait(ms: number) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function isRetriableWebDavStatus(status: number) {
  return WEBDAV_RETRY_STATUSES.has(status)
}

function errorMessageOf(error: unknown) {
  return error instanceof Error ? error.message : '网络请求失败'
}

function formatWebDavStatusError(status: number, action: string) {
  if (status === 401) return `${action}失败（401）：用户名或密码不对`
  if (status === 403) return `${action}失败（403）：账号没有访问这个目录的权限`
  if (status === 404) return `${action}失败（404）：WebDAV 地址或漫画目录不存在`
  if (status === 429) return `${action}失败（429）：云盘正在限流，稍后刷新通常会恢复`
  if (status === 502 || status === 503 || status === 504) {
    return `${action}失败（${status}）：OpenList 或上游云盘暂时不可用，稍后刷新通常会恢复`
  }
  return `${action}失败（${status}）`
}

async function requestWithWebDavRetry<T extends { status: number }>(
  request: () => Promise<T>,
  action: string,
  isOk: (status: number) => boolean = (status) => status >= 200 && status < 300,
) {
  let lastError: unknown = null
  const maxAttempts = WEBDAV_RETRY_DELAYS_MS.length + 1

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result: T | null = null

    try {
      result = await request()
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) break
      await wait(WEBDAV_RETRY_DELAYS_MS[attempt - 1])
      continue
    }

    if (isOk(result.status)) return result

    if (!isRetriableWebDavStatus(result.status) || attempt === maxAttempts) {
      throw new Error(formatWebDavStatusError(result.status, action))
    }

    await wait(WEBDAV_RETRY_DELAYS_MS[attempt - 1])
  }

  throw new Error(`${action}失败：${errorMessageOf(lastError)}`)
}

function getRootUrl(config: WebDavConfig) {
  const rootUrl = new URL(config.endpointUrl)
  const libraryPath = normalizeRelativePath(config.libraryPath)
  if (libraryPath) {
    const encodedPath = libraryPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    rootUrl.pathname = `${rootUrl.pathname.replace(/\/+$/, '')}/${encodedPath}/`
  }
  return rootUrl
}

function buildResourceUrl(config: WebDavConfig, relativePath = '', isDir = false) {
  const resourceUrl = getRootUrl(config)
  const normalizedPath = normalizeRelativePath(relativePath)
  if (normalizedPath) {
    const encodedPath = normalizedPath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    resourceUrl.pathname = `${resourceUrl.pathname.replace(/\/+$/, '')}/${encodedPath}${isDir ? '/' : ''}`
  } else if (!resourceUrl.pathname.endsWith('/')) {
    resourceUrl.pathname = `${resourceUrl.pathname}/`
  }
  return resourceUrl
}

function relativePathFromHref(config: WebDavConfig, href: string) {
  const resourceUrl = new URL(href, config.endpointUrl)
  const rootUrl = getRootUrl(config)
  const resourcePath = decodeURIComponent(resourceUrl.pathname).replace(/\/+$/, '')
  const rootPath = decodeURIComponent(rootUrl.pathname).replace(/\/+$/, '')

  if (resourcePath === rootPath) return ''
  if (!resourcePath.startsWith(`${rootPath}/`)) return ''

  return normalizeRelativePath(resourcePath.slice(rootPath.length))
}

function textFromProperty(property: Element, tagName: string) {
  return property.getElementsByTagNameNS('*', tagName)[0]?.textContent?.trim() ?? ''
}

function parsePropfindResponse(xml: string, config: WebDavConfig, currentPath: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const responses = Array.from(document.getElementsByTagNameNS('*', 'response'))
  const normalizedCurrentPath = normalizeRelativePath(currentPath)

  return responses
    .map((response) => {
      const href = response.getElementsByTagNameNS('*', 'href')[0]?.textContent?.trim()
      const property = response.getElementsByTagNameNS('*', 'prop')[0]
      if (!href || !property) return null

      const path = relativePathFromHref(config, href)
      if (path === normalizedCurrentPath) return null

      const displayName = textFromProperty(property, 'displayname') || cleanFolderTitle(path)
      const resourceType = property.getElementsByTagNameNS('*', 'resourcetype')[0]
      const isDir = Boolean(resourceType?.getElementsByTagNameNS('*', 'collection')[0])
      const rawSize = textFromProperty(property, 'getcontentlength')
      const updatedAt = textFromProperty(property, 'getlastmodified')

      return {
        name: displayName,
        path,
        isDir,
        sizeBytes: Number.parseInt(rawSize || '0', 10) || 0,
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
      } satisfies WebDavEntry
    })
    .filter((entry): entry is WebDavEntry => Boolean(entry))
}

async function propfind(relativePath = '', depth = 1) {
  const config = loadWebDavConfig()
  if (!config) {
    throw new Error('请先在云盘页填写 WebDAV 连接')
  }

  const authorization = encodeBasicAuth(config.username, config.password)
  const result = await requestWithWebDavRetry(
    async () => {
      if (isAndroidNative()) {
        const nativeResult = await nativeWebDav.propfind({
          url: buildResourceUrl(config, relativePath, true).toString(),
          authorization,
          depth: String(depth),
          body: WEBDAV_PROPFIND_BODY,
          ...nativeProxyOption(),
        })
        return {
          status: nativeResult.status,
          xml: nativeResult.data,
        }
      }

      const response = await fetch(buildResourceUrl(config, relativePath, true), {
        method: 'PROPFIND',
        headers: {
          Authorization: authorization,
          Depth: String(depth),
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: WEBDAV_PROPFIND_BODY,
      })
      return {
        status: response.status,
        xml: await response.text(),
      }
    },
    'WebDAV 请求',
    (status) => status === 207 || (status >= 200 && status < 300),
  )

  return parsePropfindResponse(result.xml, config, relativePath)
}

async function fetchBlobByPath(relativePath: string, isDir = false) {
  const config = loadWebDavConfig()
  if (!config) {
    throw new Error('请先连接 WebDAV')
  }

  const authorization = encodeBasicAuth(config.username, config.password)

  if (isAndroidNative()) {
    const result = await requestWithWebDavRetry(
      () => nativeWebDav.getFile({
        url: buildResourceUrl(config, relativePath, isDir).toString(),
        authorization,
        ...nativeProxyOption(),
      }),
      '下载远程文件',
    )

    return base64ToBlob(result.base64, result.mimeType)
  }

  const result = await requestWithWebDavRetry(
    async () => {
      const response = await fetch(buildResourceUrl(config, relativePath, isDir), {
        headers: {
          Authorization: authorization,
        },
      })

      return {
        status: response.status,
        blob: response.ok ? await response.blob() : new Blob(),
      }
    },
    '下载远程文件',
  )

  return result.blob
}

async function mkcolWebDavPath(relativePath: string) {
  const config = loadWebDavConfig()
  if (!config) {
    throw new Error('请先连接 WebDAV')
  }

  const authorization = encodeBasicAuth(config.username, config.password)
  await requestWithWebDavRetry(
    async () => {
      if (isAndroidNative()) {
        if (!nativeWebDav.mkcol) {
          throw new Error('当前 APK 不支持 WebDAV 云端备份，请更新后再试')
        }

        const nativeResult = await nativeWebDav.mkcol({
          url: buildResourceUrl(config, relativePath, true).toString(),
          authorization,
          ...nativeProxyOption(),
        })
        return {
          status: nativeResult.status,
        }
      }

      const response = await fetch(buildResourceUrl(config, relativePath, true), {
        method: 'MKCOL',
        headers: {
          Authorization: authorization,
        },
      })
      return {
        status: response.status,
      }
    },
    '创建 WebDAV 备份目录',
    (status) => status === 201 || status === 200 || status === 204 || status === 405,
  )
}

async function ensureWebDavDirectory(relativePath: string) {
  const segments = normalizeRelativePath(relativePath).split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current = normalizeRelativePath(`${current}/${segment}`)
    await mkcolWebDavPath(current)
  }
}

async function writeWebDavBlob(relativePath: string, blob: Blob, contentType = blob.type || 'application/octet-stream') {
  const config = loadWebDavConfig()
  if (!config) {
    throw new Error('请先连接 WebDAV')
  }

  await ensureWebDavDirectory(privateParentPath(normalizeRelativePath(relativePath)))
  const authorization = encodeBasicAuth(config.username, config.password)
  await requestWithWebDavRetry(
    async () => {
      if (isAndroidNative()) {
        if (!nativeWebDav.putFile) {
          throw new Error('当前 APK 不支持 WebDAV 云端备份，请更新后再试')
        }

        const nativeResult = await nativeWebDav.putFile({
          url: buildResourceUrl(config, relativePath).toString(),
          authorization,
          contentType,
          base64: await blobToBase64(blob),
          ...nativeProxyOption(),
        })
        return {
          status: nativeResult.status,
        }
      }

      const response = await fetch(buildResourceUrl(config, relativePath), {
        method: 'PUT',
        headers: {
          Authorization: authorization,
          'Content-Type': contentType,
        },
        body: blob,
      })
      return {
        status: response.status,
      }
    },
    '上传 WebDAV 备份文件',
  )
}

async function readWebDavJsonRecord<T>(relativePath: string): Promise<T | null> {
  try {
    const blob = await fetchBlobByPath(relativePath)
    const text = await blob.text()
    return text ? JSON.parse(text) as T : null
  } catch {
    return null
  }
}

async function writeWebDavJsonRecord<T>(relativePath: string, value: T) {
  await ensureWebDavDirectory(WEBDAV_REMOTE_BACKUP_DIR)
  await writeWebDavBlob(
    relativePath,
    new Blob([JSON.stringify(value)], { type: 'application/json' }),
    'application/json; charset=utf-8',
  )
}

async function getCachedCoverUrl(path: string) {
  const cachedUrl = coverObjectUrls.get(path)
  if (cachedUrl) return cachedUrl

  const preview = await getPreviewRecordAsync(path)
  const coverType = preview?.coverType || 'image/jpeg'
  const privateBlob = !isMetadataTargetOnly() && preview?.coverFilePath
    ? await readPrivateBlob(preview.coverFilePath, coverType)
    : null
  const targetBlob = !privateBlob && preview?.targetCoverPath
    ? await readTargetBlob(preview.targetCoverPath, coverType)
    : null
  const remoteBlob = !privateBlob && !targetBlob && preview?.webDavCoverPath
    ? await fetchBlobByPath(preview.webDavCoverPath).catch(() => null)
    : null
  const blob = privateBlob || targetBlob || remoteBlob
  if (blob) {
    if (!isMetadataTargetOnly() && !privateBlob && preview?.coverFilePath) {
      void writePrivateBlob(preview.coverFilePath, blob)
    }
    if (!targetBlob && preview?.targetCoverPath) {
      void writeTargetBlob(preview.targetCoverPath, blob)
    }
    const objectUrl = URL.createObjectURL(blob)
    coverObjectUrls.set(path, objectUrl)
    return objectUrl
  }

  const cacheId = `webdav-cover:${path}`
  const record = await getRecord<CloudCoverCacheRecord>('cloudCache', cacheId)
  if (!record?.blob) return ''

  const objectUrl = await cacheCoverBlob(path, record.blob)
  await deleteRecord('cloudCache', cacheId)
  return objectUrl
}

async function cacheCoverBlob(path: string, blob: Blob) {
  const coverPath = privateCoverPath(path)
  const externalCoverPath = targetCoverPath(path)
  const remoteCoverPath = webDavCoverPath(path)
  const coverType = blob.type || 'image/jpeg'
  const [savedToPrivateFiles, savedToTargetFiles, savedToWebDav] = await Promise.all([
    isMetadataTargetOnly() ? Promise.resolve(false) : writePrivateBlob(coverPath, blob),
    writeTargetBlob(externalCoverPath, blob),
    writeWebDavBlob(remoteCoverPath, blob, coverType).then(() => true).catch(() => false),
  ])

  if (savedToPrivateFiles || savedToTargetFiles || savedToWebDav) {
    const preview = await getPreviewRecordAsync(path)
    await setPreviewRecord(path, {
      imageCount: preview?.imageCount ?? 0,
      firstImagePath: preview?.firstImagePath,
      coverFilePath: savedToPrivateFiles ? coverPath : isMetadataTargetOnly() ? undefined : preview?.coverFilePath,
      targetCoverPath: savedToTargetFiles ? externalCoverPath : preview?.targetCoverPath,
      webDavCoverPath: savedToWebDav ? remoteCoverPath : preview?.webDavCoverPath,
      coverType,
      coverSizeBytes: blob.size,
      coverUpdatedAt: Date.now(),
    })
    await deleteRecord('cloudCache', `webdav-cover:${path}`)
  } else {
    const record: CloudCoverCacheRecord = {
      id: `webdav-cover:${path}`,
      blob,
      updatedAt: Date.now(),
      sizeBytes: blob.size,
    }
    await putRecord('cloudCache', record)
  }

  const currentUrl = coverObjectUrls.get(path)
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  const nextUrl = URL.createObjectURL(blob)
  coverObjectUrls.set(path, nextUrl)
  return nextUrl
}

async function getCachedPageUrl(mangaPath: string, filePath: string) {
  const cacheId = webDavPageCacheId(mangaPath, filePath)
  const cachedUrl = pageObjectUrls.get(cacheId)
  if (cachedUrl) return cachedUrl

  const record = await getRecord<CloudPageCacheRecord>('cloudCache', cacheId)
  if (!record?.blob) return ''

  record.lastAccessedAt = Date.now()
  await putRecord('cloudCache', record)

  const objectUrl = URL.createObjectURL(record.blob)
  pageObjectUrls.set(cacheId, objectUrl)
  return objectUrl
}

async function getCachedPageBlob(mangaPath: string, filePath: string) {
  const cacheId = webDavPageCacheId(mangaPath, filePath)
  const record = await getRecord<CloudPageCacheRecord>('cloudCache', cacheId)
  if (!record?.blob) return null

  record.lastAccessedAt = Date.now()
  await putRecord('cloudCache', record)
  return record.blob
}

async function cachePageBlob(mangaPath: string, file: WebDavImageFile, blob: Blob, index: number) {
  const cacheId = webDavPageCacheId(mangaPath, file.path)
  const now = Date.now()
  const record: CloudPageCacheRecord = {
    id: cacheId,
    mangaPath: normalizeRelativePath(mangaPath),
    filePath: normalizeRelativePath(file.path),
    name: file.name,
    type: file.type || blob.type || mimeFromName(file.name),
    index,
    blob,
    sizeBytes: blob.size,
    updatedAt: now,
    lastAccessedAt: now,
  }

  await putRecord('cloudCache', record)

  const currentUrl = pageObjectUrls.get(cacheId)
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  const nextUrl = URL.createObjectURL(blob)
  pageObjectUrls.set(cacheId, nextUrl)

  await enforceCloudCacheLimit()
  return nextUrl
}

function releasePageObjectUrl(mangaPath: string, filePath: string) {
  const cacheId = webDavPageCacheId(mangaPath, filePath)
  const cachedUrl = pageObjectUrls.get(cacheId)
  if (cachedUrl) URL.revokeObjectURL(cachedUrl)
  pageObjectUrls.delete(cacheId)
}

async function enforceCloudCacheLimit() {
  const settings = loadCloudCacheSettings()
  const records = (await getAllRecords<CloudPageCacheRecord>('cloudCache')).filter(isPageCacheRecord)
  let totalBytes = records.reduce((sum, record) => sum + (record.sizeBytes || record.blob?.size || 0), 0)

  if (totalBytes <= settings.maxBytes) return

  const victims = records.sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)
  for (const record of victims) {
    if (totalBytes <= settings.maxBytes) break
    const cachedUrl = pageObjectUrls.get(record.id)
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl)
      pageObjectUrls.delete(record.id)
    }
    await deleteRecord('cloudCache', record.id)
    totalBytes -= record.sizeBytes || record.blob?.size || 0
  }
}

async function readCloudCacheStats(): Promise<CloudCacheStats> {
  const records = await getAllRecords<CloudPageCacheRecord | CloudCoverCacheRecord>('cloudCache')
  const pageRecords = records.filter(isPageCacheRecord)
  const coverRecords = records.filter(isCoverCacheRecord)
  const previewCache = await loadPreviewCacheAsync()
  const privateCoverRecords = Object.values(previewCache).filter((record) => record.coverFilePath || record.targetCoverPath)
  const pageBytes = pageRecords.reduce((sum, record) => sum + (record.sizeBytes || record.blob?.size || 0), 0)
  const legacyCoverBytes = coverRecords.reduce((sum, record) => sum + (record.sizeBytes || record.blob?.size || 0), 0)
  const privateCoverBytes = privateCoverRecords.reduce((sum, record) => sum + (record.coverSizeBytes || 0), 0)
  const coverBytes = legacyCoverBytes + privateCoverBytes

  return {
    usedBytes: pageBytes + coverBytes,
    pageBytes,
    coverBytes,
    pageCount: pageRecords.length,
    coverCount: coverRecords.length + privateCoverRecords.length,
  }
}

function toProviderSummary(config: WebDavConfig | null): ProviderSummary {
  return {
    id: WEBDAV_PROVIDER_ID,
    name: 'WebDAV',
    type: 'webdav',
    connected: Boolean(config),
    usedBytes: 0,
    totalBytes: 0,
    description: config
      ? `${config.endpointUrl}${config.libraryPath || ''}`
      : '可连接 OpenList、NAS 和其他兼容 WebDAV 的云盘',
  }
}

function toWebDavImageFiles(items: WebDavEntry[]) {
  return items
    .filter((item) => !item.isDir && isImageName(item.name))
    .sort((left, right) => collator.compare(left.name, right.name))
    .map((item) => ({
      ...item,
      type: mimeFromName(item.name),
    })) satisfies WebDavImageFile[]
}

async function getWebDavImageFiles(path: string) {
  const items = await propfind(path, 1)
  const directImages = toWebDavImageFiles(items)

  const childFolders = items
    .filter((item) => item.isDir && !isWebDavBackupPath(item.path))
    .sort((left, right) => collator.compare(left.name, right.name))
  const directContentImages = directImages.filter((image) => !isCoverImageName(image.name))

  if (directImages.length > 0 && (childFolders.length === 0 || directContentImages.length > 0)) {
    return directImages
  }

  const nestedImages: WebDavImageFile[] = []
  for (const folder of childFolders) {
    const childItems = await propfind(folder.path, 1)
    nestedImages.push(...toWebDavImageFiles(childItems))
  }

  if (nestedImages.length > 0) {
    return nestedImages.sort((left, right) => collator.compare(left.path, right.path))
  }

  return directImages
}

export const cloudService = {
  localProviderId: LOCAL_PROVIDER_ID,
  webDavProviderId: WEBDAV_PROVIDER_ID,

  async ensureWebDavMetadataReady() {
    await hydrateWebDavPrivateMetadata()
  },

  async syncWebDavMetadataFromDownloadTarget() {
    return syncMetadataFromDownloadTarget()
  },

  async uploadWebDavMetadataBackup() {
    return uploadMetadataToWebDavBackup()
  },

  async syncWebDavMetadataFromCloudBackup() {
    return syncMetadataFromWebDavBackup()
  },

  async listProviders(): Promise<ProviderSummary[]> {
    const config = loadWebDavConfig()
    return [
      {
        id: LOCAL_PROVIDER_ID,
        name: '本地导入',
        type: 'local',
        connected: true,
        usedBytes: 0,
        totalBytes: 0,
        description: '本地漫画导入已经放到设置页；云盘页专注 WebDAV',
      },
      toProviderSummary(config),
    ]
  },

  getWebDavConfig() {
    return loadWebDavConfig() ?? {
      endpointUrl: '',
      username: '',
      password: '',
      libraryPath: '',
    }
  },

  async connectWebDav(config: WebDavConfig) {
    const normalized = normalizeConfig(config)
    if (!normalized.endpointUrl) throw new Error('请填写 WebDAV 地址')
    if (!normalized.username) throw new Error('请填写 WebDAV 用户名')
    if (!normalized.password) throw new Error('请填写 WebDAV 密码')

    const temporaryConfig = loadWebDavConfig()
    saveWebDavConfig(normalized)
    try {
      await propfind('', 1)
      return toProviderSummary(normalized)
    } catch (error) {
      if (temporaryConfig) {
        saveWebDavConfig(temporaryConfig)
      } else {
        clearWebDavConfig()
      }
      throw error
    }
  },

  disconnectWebDav() {
    clearWebDavConfig()
    clearIndexCache()
  },

  async getCachedWebDavMangaItems(): Promise<CloudMangaItem[]> {
    const cached = await loadIndexCacheAsync()
    return Promise.all(
      cached.items.map(async (item) => ({
        ...item,
        coverUrl: await getCachedCoverUrl(item.path),
      })),
    )
  },

  getWebDavIndexedMangas(): MangaItem[] {
    if (!loadWebDavConfig()) return []

    return loadIndexCache().items.map((item) => {
      const updatedAt = Date.parse(item.updatedAt)
      const timestamp = Number.isNaN(updatedAt) ? Date.now() : updatedAt
      return {
        id: this.buildWebDavReaderId(item.path),
        title: item.title,
        localPath: item.path,
        imageCount: item.imageCount,
        source: 'cloud',
        addedAt: timestamp,
        updatedAt: timestamp,
      }
    })
  },

  removeWebDavIndexedManga(path: string) {
    const normalizedPath = normalizeRelativePath(path)
    const cached = loadIndexCache()
    const nextRecord: WebDavIndexRecord = {
      items: cached.items.filter((item) => normalizeRelativePath(item.path) !== normalizedPath),
      syncedAt: Date.now(),
    }
    saveIndexRecord(nextRecord)
    void writeIndexCachePrivate(nextRecord)
  },

  async listFiles(providerId: string, path = ''): Promise<CloudFile[]> {
    if (providerId === LOCAL_PROVIDER_ID) {
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
    }

    if (providerId !== WEBDAV_PROVIDER_ID) {
      return []
    }

    const items = await propfind(path, 1)
    return items
      .filter((item) => item.isDir && !isWebDavBackupPath(item.path))
      .sort((left, right) => collator.compare(left.name, right.name))
      .map((item) => ({
        id: item.path || '/',
        name: item.name,
        path: item.path,
        isDir: true,
        sizeBytes: item.sizeBytes,
        updatedAt: item.updatedAt,
      }))
  },

  async getWebDavMangaItems(path = '', onProgress?: (progress: WebDavMangaIndexProgress) => void): Promise<CloudMangaItem[]> {
    const folders = await this.listFiles(WEBDAV_PROVIDER_ID, path)
    const mangaItems: Array<CloudMangaItem | null> = new Array(folders.length).fill(null)
    const concurrency = Math.min(cloudThreadSettings.getSettings().threadCount, Math.max(1, folders.length))
    let nextIndex = 0
    let completed = 0

    const loadPreview = async (index: number) => {
      const folder = folders[index]
      const cachedPreview = await getPreviewRecordAsync(folder.path)
      let preview = {
        imageCount: cachedPreview?.imageCount ?? 0,
        coverUrl: await getCachedCoverUrl(folder.path),
      }

      try {
        preview = await this.getWebDavMangaPreview(folder.path)
      } catch {
        // 某个封面或页数读取失败时，仍然先把文件夹显示出来。
      }

      mangaItems[index] = {
        id: folder.path || '/',
        title: folder.name,
        path: folder.path,
        updatedAt: folder.updatedAt,
        sizeBytes: folder.sizeBytes,
        imageCount: preview.imageCount,
        coverUrl: preview.coverUrl,
      }

      completed += 1
      onProgress?.({
        current: completed,
        total: folders.length,
        title: folder.name,
      })
    }

    const runWorker = async () => {
      while (nextIndex < folders.length) {
        const index = nextIndex
        nextIndex += 1
        await loadPreview(index)
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()))

    return mangaItems.filter((item): item is CloudMangaItem => Boolean(item))
  },

  async refreshWebDavMangaIndex(path = '', onProgress?: (progress: WebDavMangaIndexProgress) => void) {
    const items = await this.getWebDavMangaItems(path, onProgress)
    await saveIndexCache(items)
    return items
  },

  async getWebDavMangaPreview(path: string) {
    const cachedCoverUrl = await getCachedCoverUrl(path)
    const cachedPreview = await getPreviewRecordAsync(path)
    if (cachedCoverUrl && cachedPreview && cachedPreview.imageCount > 0) {
      return {
        imageCount: cachedPreview.imageCount,
        coverUrl: cachedCoverUrl,
      }
    }

    const images = await getWebDavImageFiles(path)
    const firstImage = images[0]
    const imageCount = images.length
    let coverUrl = cachedCoverUrl

    if (firstImage && !coverUrl) {
      const blob = await fetchBlobByPath(firstImage.path)
      coverUrl = await cacheCoverBlob(path, blob)
    }

    const previewWithCover = await getPreviewRecordAsync(path)
    await setPreviewRecord(path, {
      imageCount,
      firstImagePath: firstImage?.path,
      coverFilePath: previewWithCover?.coverFilePath,
      targetCoverPath: previewWithCover?.targetCoverPath,
      coverType: previewWithCover?.coverType,
      coverSizeBytes: previewWithCover?.coverSizeBytes,
      coverUpdatedAt: previewWithCover?.coverUpdatedAt,
    })

    return {
      imageCount,
      coverUrl,
    }
  },

  async getCachedWebDavCoverUrl(path: string) {
    return getCachedCoverUrl(path)
  },

  buildWebDavReaderId(path: string) {
    return `cloud-webdav:${encodeURIComponent(normalizeRelativePath(path))}`
  },

  isWebDavReaderId(value: string) {
    return value.startsWith('cloud-webdav:')
  },

  pathFromReaderId(readerId: string) {
    return decodeURIComponent(readerId.slice('cloud-webdav:'.length))
  },

  async getWebDavReaderAssets(readerId: string) {
    const path = this.pathFromReaderId(readerId)
    const title = cleanFolderTitle(path)
    const files = await getWebDavImageFiles(path)
    if (files.length === 0) {
      throw new Error('该文件夹里没有可阅读的图片')
    }

    const images = files.map((file, index) => ({
      id: `${readerId}:${index}`,
      index,
      name: file.name,
      type: file.type,
      src: '',
      remotePath: file.path,
    } satisfies ImageAsset))

    return {
      id: readerId,
      title,
      imageCount: images.length,
      images,
    }
  },

  async loadWebDavImageAssetSrc(mangaPath: string, image: ImageAsset) {
    if (image.src) return image.src
    if (!image.remotePath) return ''

    const cachedUrl = await getCachedPageUrl(mangaPath, image.remotePath)
    if (cachedUrl) return cachedUrl

    const file: WebDavImageFile = {
      name: image.name,
      path: image.remotePath,
      isDir: false,
      sizeBytes: 0,
      updatedAt: new Date().toISOString(),
      type: image.type,
    }
    const blob = await fetchBlobByPath(file.path)
    return cachePageBlob(mangaPath, file, blob, image.index)
  },

  async getCachedWebDavImageBlob(mangaPath: string, filePath: string) {
    return getCachedPageBlob(mangaPath, filePath)
  },

  releaseWebDavImageAssetSrc(mangaPath: string, image: ImageAsset) {
    if (!image.remotePath) return
    releasePageObjectUrl(mangaPath, image.remotePath)
  },

  async reloadWebDavImageAssetSrc(mangaPath: string, image: ImageAsset) {
    if (!image.remotePath) return ''

    releasePageObjectUrl(mangaPath, image.remotePath)
    const file: WebDavImageFile = {
      name: image.name,
      path: image.remotePath,
      isDir: false,
      sizeBytes: 0,
      updatedAt: new Date().toISOString(),
      type: image.type,
    }
    const blob = await fetchBlobByPath(file.path)
    return cachePageBlob(mangaPath, file, blob, image.index)
  },

  async getWebDavDownloadItems(path: string) {
    const files = await getWebDavImageFiles(path)
    if (files.length === 0) {
      throw new Error('该文件夹里没有可下载的图片')
    }

    return {
      title: cleanFolderTitle(path),
      files: files.map((file) => ({
        name: file.name,
        path: file.path,
        type: file.type,
      })),
    }
  },

  async fetchWebDavBlob(path: string) {
    return fetchBlobByPath(path)
  },

  getCloudCacheSettings() {
    return loadCloudCacheSettings()
  },

  async updateCloudCacheSettings(settings: Partial<CloudCacheSettings>) {
    const previous = loadCloudCacheSettings()
    const currentIndex = loadIndexCache()
    const currentPreview = loadPreviewCache()
    saveCloudCacheSettings({ ...previous, ...settings })
    const next = loadCloudCacheSettings()

    if (next.metadataTargetOnly) {
      if (currentIndex.items.length > 0) {
        await writeTargetJsonRecord(WEBDAV_TARGET_INDEX_FILE, currentIndex)
      }
      if (Object.keys(currentPreview).length > 0) {
        await writeTargetJsonRecord(WEBDAV_TARGET_PREVIEWS_FILE, currentPreview)
      }
      localStorage.removeItem(WEBDAV_INDEX_KEY)
      localStorage.removeItem(WEBDAV_PREVIEW_KEY)
      void deletePrivateFile(WEBDAV_PRIVATE_INDEX_PATH)
      void deletePrivateFile(WEBDAV_PRIVATE_PREVIEWS_PATH)
      void deletePrivateDirectory(WEBDAV_PRIVATE_COVER_DIR)
    }

    if (next.metadataTargetOnly !== previous.metadataTargetOnly) {
      resetWebDavMetadataHydration()
    }

    await enforceCloudCacheLimit()
    return loadCloudCacheSettings()
  },

  async getCloudCacheStats() {
    return readCloudCacheStats()
  },

  async clearCloudCache(options?: { includeCovers?: boolean }) {
    const includeCovers = Boolean(options?.includeCovers)
    const records = await getAllRecords<CloudPageCacheRecord | CloudCoverCacheRecord>('cloudCache')
    await Promise.all(
      records
        .filter((record) => isPageCacheRecord(record) || (includeCovers && isCoverCacheRecord(record)))
        .map((record) => deleteRecord('cloudCache', record.id)),
    )
    pageObjectUrls.forEach((url) => URL.revokeObjectURL(url))
    pageObjectUrls.clear()
    if (includeCovers) {
      await deletePrivateDirectory(WEBDAV_PRIVATE_COVER_DIR)
      await deleteTargetMetadata(WEBDAV_TARGET_COVER_DIR)
      await clearPreviewCoverRecords()
      coverObjectUrls.forEach((url) => URL.revokeObjectURL(url))
      coverObjectUrls.clear()
    }
  },

  async downloadWebDavManga(path: string) {
    const files = await getWebDavImageFiles(path)
    if (files.length === 0) {
      throw new Error('该文件夹里没有可下载的图片')
    }

    const blobs = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        blob: await fetchBlobByPath(file.path),
      })),
    )

    return {
      title: cleanFolderTitle(path),
      images: blobs,
    }
  },
}
