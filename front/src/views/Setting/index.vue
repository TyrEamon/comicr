<template>
  <div class="page settings-page">
    <p class="label-caps">设置</p>

    <section class="surface-card setting-card library-card">
      <div class="setting-card-header">
        <div>
          <h2>漫画库</h2>
          <p>{{ library.count }} 本漫画 · {{ authorizedFolderRoots.length }} 个授权目录</p>
        </div>
      </div>

      <label class="input-label" for="import-title">导入名称</label>
      <input
        id="import-title"
        v-model="importTitle"
        class="text-input"
        type="text"
        placeholder="单本可手动命名，多本会使用文件名"
        autocomplete="off"
      />

      <div class="import-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="handleArchiveButton">
          <Archive :size="18" />
          压缩包
        </button>
        <button class="primary-button import-button" type="button" :disabled="busy" @click="handleFolderImport">
          <FolderOpen :size="18" />
          授权目录
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy || authorizedFolderRoots.length === 0" @click="handleRefreshAuthorizedFolders">
          <RotateCcw :size="18" />
          刷新书库
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="imageInput?.click()">
          <Images :size="18" />
          图片/文件
        </button>
      </div>

      <input ref="archiveInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" multiple @change="handleArchiveImport" />
      <input ref="imageInput" class="hidden-input" type="file" accept="image/*,.epub,.txt,application/epub+zip,text/plain" multiple @change="handleImageFilesImport($event, '图片/文件')" />

      <div v-if="message" class="import-message">
        <span>{{ message }}</span>
        <RouterLink v-if="importedManga" :to="`/manga/${importedManga.id}`">查看详情</RouterLink>
      </div>
    </section>

    <section class="surface-card setting-card">
      <div class="setting-card-header">
        <div>
          <h2>阅读偏好</h2>
          <p>默认阅读器</p>
        </div>
        <span class="status-pill">计划中</span>
      </div>
    </section>

    <section class="surface-card setting-card storage-card">
      <div class="setting-card-header">
        <div>
          <h2>站点凭据</h2>
          <p>ExHentai 访问 Cookie</p>
        </div>
        <span class="status-pill">{{ exhentaiCookie.trim() ? '已设置' : '可选' }}</span>
      </div>

      <label class="input-label" for="exhentai-cookie">ExHentai Cookie</label>
      <textarea
        id="exhentai-cookie"
        v-model="exhentaiCookie"
        class="text-input credential-input"
        rows="3"
        spellcheck="false"
        autocomplete="off"
        placeholder="ipb_member_id=...; ipb_pass_hash=...; igneous=..."
      />

      <div class="cache-actions">
        <button class="ghost-button import-button" type="button" @click="saveExhentaiCookie">
          <HardDrive :size="18" />
          保存 Cookie
        </button>
        <button class="ghost-button import-button danger-action" type="button" :disabled="!exhentaiCookie.trim()" @click="clearExhentaiCookie">
          <Trash2 :size="18" />
          清除 Cookie
        </button>
      </div>
    </section>

    <section class="surface-card setting-card storage-card">
      <div class="setting-card-header">
        <div>
          <h2>网络代理</h2>
          <p>{{ proxySummary }}</p>
        </div>
        <span class="status-pill">{{ proxyEnabled ? '应用内' : '全局' }}</span>
      </div>

      <label class="cover-cache-toggle">
        <input v-model="proxyEnabled" type="checkbox" @change="toggleProxyMode" />
        <span>启用应用内代理，关闭时走手机当前全局网络/代理</span>
      </label>

      <label class="input-label" for="network-proxy">代理地址</label>
      <input
        id="network-proxy"
        v-model="proxyInput"
        class="text-input"
        type="text"
        placeholder="socks5://host:port 或 tg://socks?server=...&port=..."
        autocomplete="off"
      />
      <p class="proxy-help">开启后只影响 Comicr 内部的云盘、下载解析、图片下载和 JM 下载。</p>
      <p v-if="proxyTestLatencyMs !== null" class="proxy-help">上次测试延迟：{{ proxyTestLatencyMs }} ms</p>

      <div class="cache-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="saveProxySettings">
          <HardDrive :size="18" />
          保存代理
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="testProxySettings">
          <Wifi :size="18" />
          测试连接
        </button>
        <button class="ghost-button import-button danger-action" type="button" :disabled="busy || !proxyInput.trim()" @click="clearProxySettings">
          <Trash2 :size="18" />
          关闭代理
        </button>
      </div>
    </section>

    <section class="surface-card setting-card storage-card">
      <div class="setting-card-header">
        <div>
          <h2>下载位置</h2>
          <p>{{ downloadTargetLabel }}</p>
        </div>
        <span class="status-pill">{{ hasCustomDownloadTarget ? '自定义' : '默认' }}</span>
      </div>

      <div class="cache-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy || !downloadTargetAvailable" @click="pickDownloadTarget">
          <FolderOpen :size="18" />
          选择目录
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy || !hasCustomDownloadTarget" @click="resetDownloadTarget">
          <RotateCcw :size="18" />
          恢复默认
        </button>
      </div>

      <div class="download-concurrency">
        <div>
          <label class="input-label">云盘线程数</label>
          <p>影响云盘封面读取和单本漫画下载速度</p>
        </div>
        <div class="stepper-control" role="group" aria-label="云盘线程数">
          <button class="stepper-button" type="button" :disabled="cloudThreadCount <= MIN_THREAD_COUNT" aria-label="减少云盘线程数" @click="setCloudThreadCount(cloudThreadCount - 1)">-</button>
          <input
            class="stepper-value"
            type="number"
            inputmode="numeric"
            :min="MIN_THREAD_COUNT"
            :max="MAX_CLOUD_THREAD_COUNT"
            :value="cloudThreadCount"
            aria-label="云盘线程数"
            @change="setCloudThreadCountFromInput"
            @blur="setCloudThreadCountFromInput"
          />
          <button class="stepper-button" type="button" :disabled="cloudThreadCount >= MAX_CLOUD_THREAD_COUNT" aria-label="增加云盘线程数" @click="setCloudThreadCount(cloudThreadCount + 1)">+</button>
        </div>
      </div>

      <div class="download-concurrency">
        <div>
          <label class="input-label">JM 线程数</label>
          <p>只影响 JM 原图下载，图片还原和写入仍会顺序处理</p>
        </div>
        <div class="stepper-control" role="group" aria-label="JM 线程数">
          <button class="stepper-button" type="button" :disabled="jmThreadCount <= MIN_THREAD_COUNT" aria-label="减少 JM 线程数" @click="setJmThreadCount(jmThreadCount - 1)">-</button>
          <input
            class="stepper-value"
            type="number"
            inputmode="numeric"
            :min="MIN_THREAD_COUNT"
            :max="MAX_JM_THREAD_COUNT"
            :value="jmThreadCount"
            aria-label="JM 线程数"
            @change="setJmThreadCountFromInput"
            @blur="setJmThreadCountFromInput"
          />
          <button class="stepper-button" type="button" :disabled="jmThreadCount >= MAX_JM_THREAD_COUNT" aria-label="增加 JM 线程数" @click="setJmThreadCount(jmThreadCount + 1)">+</button>
        </div>
      </div>
    </section>

    <section class="surface-card setting-card tips-card" :class="{ 'tips-card-expanded': tipsExpanded }">
      <button
        class="tips-toggle"
        type="button"
        :aria-expanded="tipsExpanded"
        aria-controls="download-link-tips"
        @click="tipsExpanded = !tipsExpanded"
      >
        <div>
          <h2>下载链接 Tips</h2>
          <p>下载页可粘贴漫画/本子链接或 JM 码。</p>
        </div>
        <span class="status-pill tips-toggle-pill">
          支持格式
          <ChevronDown :size="15" class="tips-toggle-icon" />
        </span>
      </button>

      <div v-if="tipsExpanded" id="download-link-tips" class="tips-list">
        <span>
          <strong>JM / 18Comic</strong>
          <small>JM 码：jm123456</small>
          <code>https://18comic.vip/photo/123456</code>
        </span>
        <span>
          <strong>E-Hentai / ExHentai</strong>
          <code>https://e-hentai.org/g/123456/token/</code>
          <code>https://exhentai.org/g/123456/token/</code>
        </span>
        <span>
          <strong>Telegraph</strong>
          <code>https://telegra.ph/xxx-xx-xx</code>
        </span>
        <span>
          <strong>WNACG</strong>
          <code>https://www.wnacg.com/photos-index-aid-123.html</code>
        </span>
        <span>
          <strong>nhentai / Hitomi</strong>
          <code>https://nhentai.xxx/g/123456/</code>
          <code>https://hitomi.la/manga/example-123456.html</code>
        </span>
      </div>
    </section>

    <section class="surface-card setting-card storage-card">
      <div class="setting-card-header">
        <div>
          <h2>缓存管理</h2>
          <p>云盘阅读缓存</p>
        </div>
        <span class="status-pill">{{ formatBytes(cacheStats.usedBytes) }}</span>
      </div>

      <div class="cache-stats">
        <div>
          <strong>{{ cacheStats.pageCount }}</strong>
          <span>缓存页</span>
        </div>
        <div>
          <strong>{{ formatBytes(cacheStats.coverBytes) }}</strong>
          <span>封面</span>
        </div>
      </div>

      <label class="input-label" for="cloud-cache-limit">缓存上限（MB）</label>
      <input
        id="cloud-cache-limit"
        v-model.number="cacheLimitMb"
        class="text-input"
        type="number"
        min="50"
        step="50"
        inputmode="numeric"
      />

      <label class="cover-cache-toggle">
        <input v-model="clearCoverCache" type="checkbox" />
        <span>清理时同时删除封面缓存</span>
      </label>

      <div class="cache-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="saveCacheLimit">
          <HardDrive :size="18" />
          保存上限
        </button>
        <button class="ghost-button import-button danger-action" type="button" :disabled="busy || cacheStats.usedBytes === 0" @click="clearCloudCache">
          <Trash2 :size="18" />
          清理缓存
        </button>
      </div>
    </section>

    <section class="surface-card setting-card about-card">
      <div>
        <h2>About</h2>
        <p>Power by TyrEamon</p>
      </div>
      <a class="about-link" href="https://github.com/TyrEamon/comicr" target="_blank" rel="noreferrer">
        GitHub · TyrEamon/comicr
      </a>
    </section>
  </div>
</template>

<script setup lang="ts">
import { archiveService } from '@/services/archiveService'
import { archiveErrorMessage } from '@/services/archiveErrors'
import { cloudService } from '@/services/cloudService'
import { cloudThreadSettings } from '@/services/cloudThreadSettings'
import { downloadSiteSettings } from '@/services/downloadSiteSettings'
import { downloadTargetService } from '@/services/downloadTargetService'
import { jmThreadSettings } from '@/services/jmThreadSettings'
import { libraryService } from '@/services/libraryService'
import { localFolderService } from '@/services/localFolderService'
import { nativeHttpService } from '@/services/nativeHttpService'
import { networkProxySettings } from '@/services/networkProxySettings'
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, ChevronDown, FolderOpen, HardDrive, Images, RotateCcw, Trash2, Wifi } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

const library = useLibraryStore()
const archiveInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const importTitle = ref('')
const message = ref('')
const busy = ref(false)
const importedManga = ref<{ id: string; title: string } | null>(null)
const cacheStats = ref({ usedBytes: 0, pageBytes: 0, coverBytes: 0, pageCount: 0, coverCount: 0 })
const cacheLimitMb = ref(Math.round(cloudService.getCloudCacheSettings().maxBytes / 1024 / 1024))
const clearCoverCache = ref(false)
const cloudThreadCount = ref(cloudThreadSettings.getSettings().threadCount)
const jmThreadCount = ref(jmThreadSettings.getSettings().threadCount)
const exhentaiCookie = ref(downloadSiteSettings.getSettings().exhentaiCookie)
const proxyInput = ref(networkProxySettings.toInputValue())
const proxyEnabled = ref(networkProxySettings.getSettings().enabled)
const proxySettingsVersion = ref(0)
const proxyTestLatencyMs = ref<number | null>(null)
const tipsExpanded = ref(false)
const MIN_THREAD_COUNT = 1
const MAX_CLOUD_THREAD_COUNT = 4
const MAX_JM_THREAD_COUNT = 8
const downloadTargetVersion = ref(0)
const downloadTargetAvailable = downloadTargetService.isAvailable()
const authorizedFolderRoots = ref(localFolderService.getAuthorizedRoots())
const downloadTargetLabel = computed(() => {
  downloadTargetVersion.value
  return downloadTargetService.getTargetLabel()
})
const hasCustomDownloadTarget = computed(() => {
  downloadTargetVersion.value
  return Boolean(downloadTargetService.getTarget())
})
const proxySummary = computed(() => {
  proxySettingsVersion.value
  return networkProxySettings.describe()
})

onMounted(() => {
  void library.ensureLoaded()
  void refreshCloudCacheStats()
})

function requestedTitle() {
  return importTitle.value.trim() || undefined
}

function isEpubImportFile(file: File) {
  return file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip'
}

function isTextImportFile(file: File) {
  return file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain'
}

function handleArchiveButton() {
  if (archiveService.isAvailable()) {
    void handleNativeArchiveImport()
    return
  }
  archiveInput.value?.click()
}

async function handleNativeArchiveImport() {
  busy.value = true
  importedManga.value = null
  message.value = '正在申请压缩包授权...'
  try {
    const result = await archiveService.pickArchives()
    const archives = result.archives
    if (archives.length === 0) throw new Error('没有可导入的压缩包')

    const manualTitle = requestedTitle()
    let totalImages = 0
    let partialArchives = 0
    let lastManga: { id: string; title: string } | null = null

    for (const [index, archive] of archives.entries()) {
      const title = archives.length === 1 ? manualTitle || archive.title : archive.title
      message.value = `正在保存压缩包索引 ${index + 1}/${archives.length}：${title}`
      if (archive.partial) partialArchives += 1
      const manga = await library.importArchiveRefs(
        title,
        archive.pages.map((page) => ({
          name: page.name,
          type: page.type,
          archiveUri: page.archiveUri,
          entryName: page.entryName,
        })),
        false,
      )
      totalImages += manga.imageCount
      lastManga = { id: manga.id, title: manga.title }
    }

    await library.refresh()
    importedManga.value = archives.length === 1 ? lastManga : null
    const skipped = result.errors?.length ? `，跳过 ${result.errors.length} 个无效压缩包` : ''
    const partial = partialArchives > 0 ? `，其中 ${partialArchives} 个压缩包未下载完整，只导入可读取页面` : ''
    message.value = archives.length === 1 && lastManga
      ? `已添加 ${lastManga.title}（${totalImages} 页，不解压不复制）${skipped}${partial}`
      : `已添加 ${archives.length} 本压缩包漫画，共 ${totalImages} 页，不解压不复制${skipped}${partial}`
    importTitle.value = ''
  } catch (error) {
    message.value = archiveErrorMessage(error, '压缩包索引')
  } finally {
    busy.value = false
  }
}

async function handleArchiveImport(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return

  busy.value = true
  importedManga.value = null
  message.value = '正在导入压缩包...'
  try {
    const manualTitle = requestedTitle()
    let totalImages = 0
    let lastManga: { id: string; title: string } | null = null

    for (const [index, file] of files.entries()) {
      const title = files.length === 1 ? manualTitle : undefined
      message.value = `正在导入压缩包 ${index + 1}/${files.length}：${file.name}`
      const manga = await library.importArchive(file, title, false)
      totalImages += manga.imageCount
      lastManga = { id: manga.id, title: manga.title }
    }

    await library.refresh()
    importedManga.value = files.length === 1 ? lastManga : null
    message.value = files.length === 1 && lastManga
      ? `已导入 ${lastManga.title}（${totalImages} 页）`
      : `已导入 ${files.length} 个压缩包，共 ${totalImages} 页`
    importTitle.value = ''
  } catch (error) {
    message.value = archiveErrorMessage(error, '导入压缩包')
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function handleImageFilesImport(event: Event, label: string) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return
  const epubFiles = files.filter(isEpubImportFile)
  const textFiles = files.filter(isTextImportFile)
  const imageFiles = files.filter((file) => !isEpubImportFile(file) && !isTextImportFile(file))

  busy.value = true
  importedManga.value = null
  message.value = `正在导入${label}...`
  try {
    if (epubFiles.length === 0 && textFiles.length === 0 && imageFiles.length === 0) {
      throw new Error('请选择图片、EPUB 或 TXT 文件')
    }

    const manualTitle = requestedTitle()
    const importGroups = epubFiles.length + textFiles.length + (imageFiles.length > 0 ? 1 : 0)
    let totalImages = 0
    let count = 0
    let lastManga: { id: string; title: string } | null = null

    if (imageFiles.length > 0) {
      message.value = '正在导入图片...'
      const manga = await library.importImageFiles(imageFiles, importGroups === 1 ? manualTitle : undefined)
      totalImages += manga.imageCount
      count += 1
      lastManga = { id: manga.id, title: manga.title }
    }

    for (const [index, file] of epubFiles.entries()) {
      const title = importGroups === 1 ? manualTitle : undefined
      message.value = `正在解析 EPUB ${index + 1}/${epubFiles.length}：${file.name}`
      const manga = await library.importEpubFile(file, title, false)
      totalImages += manga.imageCount
      count += 1
      lastManga = { id: manga.id, title: manga.title }
    }

    for (const [index, file] of textFiles.entries()) {
      const title = importGroups === 1 ? manualTitle : undefined
      message.value = `正在解析 TXT ${index + 1}/${textFiles.length}：${file.name}`
      const manga = await library.importTextFile(file, title, false)
      totalImages += manga.imageCount
      count += 1
      lastManga = { id: manga.id, title: manga.title }
    }

    if (epubFiles.length > 0 || textFiles.length > 0) await library.refresh()
    importedManga.value = count === 1 ? lastManga : null
    message.value = count === 1 && lastManga
      ? `已导入 ${lastManga.title}（${totalImages} 页）`
      : `已导入 ${count} 本，共 ${totalImages} 页`
    importTitle.value = ''
  } catch (error) {
    message.value = error instanceof Error ? error.message : `${label}导入失败`
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function handleFolderImport() {
  busy.value = true
  importedManga.value = null
  message.value = '正在申请文件夹授权...'
  try {
    const folders = await localFolderService.pickFolder((progress) => {
      message.value = `正在建立索引 ${progress.current}/${progress.total}：${progress.title}`
    })
    const result = await importLocalLibraryItems(folders, requestedTitle())

    await library.refresh()
    authorizedFolderRoots.value = localFolderService.getAuthorizedRoots()
    importedManga.value = folders.length === 1 ? result.lastManga : null
    message.value = result.count === 1 && result.lastManga
      ? `已添加 ${result.lastManga.title}（${result.totalImages} 页，不复制原图）`
      : `已更新 ${result.count} 本漫画，共 ${result.totalImages} 页，不复制原图`
    importTitle.value = ''
  } catch (error) {
    message.value = error instanceof Error ? error.message : '文件夹导入失败'
  } finally {
    busy.value = false
  }
}

async function handleRefreshAuthorizedFolders() {
  busy.value = true
  importedManga.value = null
  message.value = '正在刷新已授权漫画库...'
  try {
    const folders = await localFolderService.scanAuthorizedFolders((progress) => {
      message.value = `正在扫描授权目录 ${progress.current}/${progress.total}：${progress.title}`
    })
    const result = await importLocalLibraryItems(folders)

    await library.refresh()
    authorizedFolderRoots.value = localFolderService.getAuthorizedRoots()
    importedManga.value = result.count === 1 ? result.lastManga : null
    message.value = result.count === 0
      ? '已授权目录里没有识别到新漫画'
      : `已刷新 ${result.count} 本漫画，共 ${result.totalImages} 页`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '刷新书库失败'
  } finally {
    busy.value = false
  }
}

async function importLocalLibraryItems(
  folders: Awaited<ReturnType<typeof localFolderService.pickFolder>>,
  manualTitle?: string,
) {
  let totalImages = 0
  let count = 0
  let lastManga: { id: string; title: string } | null = null

  for (const [index, folder] of folders.entries()) {
    const title = folders.length === 1 ? manualTitle || folder.title : folder.title
    const mangaId = libraryService.stableImportId(folder.sourceType, folder.sourceKey)
    const localPath = `${folder.sourceType}:${folder.sourceVersionKey || folder.sourceKey}`
    const existing = await libraryService.getManga(mangaId)
    const isReaderFile = folder.sourceType === 'epub' || folder.sourceType === 'txt'
    if (existing?.localPath === localPath && (isReaderFile || existing.imageCount === folder.imageCount)) {
      continue
    }

    message.value = `正在保存索引 ${index + 1}/${folders.length}：${title}`

    const manga = isReaderFile
      ? await importLocalReaderFile(folder, title, mangaId, localPath)
      : folder.sourceType === 'archive'
      ? await library.importArchiveRefs(
        title,
        folder.images
          .filter((image) => image.archiveUri && image.entryName)
          .map((image) => ({
            name: image.name,
            type: image.type,
            archiveUri: image.archiveUri as string,
            entryName: image.entryName as string,
          })),
        false,
        { id: mangaId, localPath },
      )
      : await library.importImageRefs(
        title,
        folder.images
          .filter((image) => image.uri)
          .map((image) => ({
            name: image.name,
            type: image.type,
            uri: image.uri as string,
          })),
        'folder',
        { id: mangaId, localPath },
      )

    totalImages += manga.imageCount
    count += 1
    lastManga = { id: manga.id, title: manga.title }
    if (isReaderFile) await yieldAfterReaderImport()
  }

  return {
    count,
    totalImages,
    lastManga,
  }
}

async function importLocalReaderFile(
  folder: Awaited<ReturnType<typeof localFolderService.pickFolder>>[number],
  title: string,
  mangaId: string,
  localPath: string,
) {
  const fileRef = folder.images.find((image) => image.uri)
  if (!fileRef?.uri) {
    throw new Error(`${title} 缺少可读取的文件地址`)
  }

  const file = await localFolderService.readFile(fileRef.uri, fileRef.type)
  return folder.sourceType === 'epub'
    ? libraryService.importEpubFile(file, title, { id: mangaId, localPath })
    : libraryService.importTextFile(file, title, { id: mangaId, localPath })
}

function yieldAfterReaderImport() {
  return new Promise((resolve) => window.setTimeout(resolve, 20))
}

async function refreshCloudCacheStats() {
  cacheStats.value = await cloudService.getCloudCacheStats()
}

async function pickDownloadTarget() {
  busy.value = true
  try {
    const target = await downloadTargetService.pickTarget()
    downloadTargetVersion.value += 1
    message.value = `下载位置已设置：${target.name}`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '设置下载位置失败'
  } finally {
    busy.value = false
  }
}

function resetDownloadTarget() {
  downloadTargetService.clearTarget()
  downloadTargetVersion.value += 1
  message.value = '下载位置已恢复为 Download/Comicr'
}

function setCloudThreadCount(value: number) {
  const settings = cloudThreadSettings.updateSettings({ threadCount: value })
  cloudThreadCount.value = settings.threadCount
  message.value = `云盘线程数已设置为 ${settings.threadCount}`
}

function setCloudThreadCountFromInput(event: Event) {
  const input = event.target as HTMLInputElement
  setCloudThreadCount(Number(input.value))
  input.value = String(cloudThreadCount.value)
}

function setJmThreadCount(value: number) {
  const settings = jmThreadSettings.updateSettings({ threadCount: value })
  jmThreadCount.value = settings.threadCount
  message.value = `JM 线程数已设置为 ${settings.threadCount}`
}

function setJmThreadCountFromInput(event: Event) {
  const input = event.target as HTMLInputElement
  setJmThreadCount(Number(input.value))
  input.value = String(jmThreadCount.value)
}

function saveExhentaiCookie() {
  const settings = downloadSiteSettings.updateSettings({ exhentaiCookie: exhentaiCookie.value })
  exhentaiCookie.value = settings.exhentaiCookie
  message.value = settings.exhentaiCookie ? 'ExHentai Cookie 已保存' : 'ExHentai Cookie 已清空'
}

function clearExhentaiCookie() {
  const settings = downloadSiteSettings.clearExhentaiCookie()
  exhentaiCookie.value = settings.exhentaiCookie
  message.value = 'ExHentai Cookie 已清空'
}

function saveProxySettings() {
  try {
    let settings = networkProxySettings.updateFromInput(proxyInput.value)
    settings = networkProxySettings.setEnabled(proxyEnabled.value)
    proxyInput.value = networkProxySettings.toInputValue(settings)
    proxyEnabled.value = settings.enabled && settings.type !== 'off'
    proxyTestLatencyMs.value = null
    proxySettingsVersion.value += 1
    message.value = settings.type === 'off'
      ? '未填写应用内代理，当前走手机全局网络'
      : `网络代理已保存：${networkProxySettings.describe(settings)}`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存网络代理失败'
  }
}

async function testProxySettings() {
  busy.value = true
  try {
    let settings = networkProxySettings.updateFromInput(proxyInput.value)
    settings = networkProxySettings.setEnabled(true)
    proxyEnabled.value = true
    proxyInput.value = networkProxySettings.toInputValue(settings)
    proxySettingsVersion.value += 1
    if (settings.type === 'off') {
      throw new Error('请先填写代理地址')
    }
    proxyTestLatencyMs.value = null
    const startedAt = performance.now()
    await nativeHttpService.head('https://www.gstatic.com/generate_204')
    proxyTestLatencyMs.value = Math.max(0, Math.round(performance.now() - startedAt))
    message.value = `代理测试通过：${networkProxySettings.describe(settings)}，延迟 ${proxyTestLatencyMs.value} ms`
  } catch (error) {
    proxyTestLatencyMs.value = null
    message.value = error instanceof Error ? error.message : '代理测试失败'
  } finally {
    busy.value = false
  }
}

function clearProxySettings() {
  networkProxySettings.clear()
  proxyInput.value = ''
  proxyEnabled.value = false
  proxyTestLatencyMs.value = null
  proxySettingsVersion.value += 1
  message.value = '应用内代理已关闭，当前走手机全局网络'
}

function toggleProxyMode() {
  try {
    const settings = networkProxySettings.setEnabled(proxyEnabled.value)
    proxyEnabled.value = settings.enabled && settings.type !== 'off'
    proxyTestLatencyMs.value = null
    proxySettingsVersion.value += 1
    message.value = settings.type === 'off'
      ? '请先填写代理地址'
      : settings.enabled ? '已启用应用内代理' : '已切回手机全局网络/代理'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '切换代理模式失败'
  }
}

async function saveCacheLimit() {
  busy.value = true
  try {
    const settings = await cloudService.updateCloudCacheSettings({
      maxBytes: Math.max(50, Number(cacheLimitMb.value) || 300) * 1024 * 1024,
    })
    cacheLimitMb.value = Math.round(settings.maxBytes / 1024 / 1024)
    await refreshCloudCacheStats()
    message.value = `云盘缓存上限已保存：${cacheLimitMb.value} MB`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存缓存设置失败'
  } finally {
    busy.value = false
  }
}

async function clearCloudCache() {
  busy.value = true
  try {
    await cloudService.clearCloudCache({ includeCovers: clearCoverCache.value })
    await refreshCloudCacheStats()
    message.value = clearCoverCache.value ? '云盘页面和封面缓存已清理' : '云盘页面缓存已清理'
  } catch (error) {
    message.value = error instanceof Error ? error.message : '清理缓存失败'
  } finally {
    busy.value = false
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}
</script>

<style scoped>
.settings-page {
  display: grid;
  gap: 22px;
}

.setting-card {
  padding: 22px;
}

.library-card {
  display: grid;
  gap: 14px;
}

.storage-card {
  display: grid;
  gap: 14px;
}

.tips-card {
  display: grid;
  gap: 0;
}

.tips-card-expanded {
  gap: 14px;
}

.tips-toggle {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  text-align: left;
}

.tips-toggle-pill {
  gap: 6px;
  flex-shrink: 0;
}

.tips-toggle-icon {
  transition: transform 160ms ease;
}

.tips-card-expanded .tips-toggle-icon {
  transform: rotate(180deg);
}

.setting-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.setting-card h2 {
  margin: 0 0 8px;
  font-weight: 400;
}

.setting-card p {
  margin: 0;
  color: rgba(209, 197, 183, 0.66);
  line-height: 1.7;
}

.input-label {
  color: rgba(209, 197, 183, 0.72);
  font-size: 13px;
}

.import-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cache-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cache-stats div {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(153, 143, 131, 0.16);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
}

.cache-stats strong {
  color: var(--color-text);
  font-size: 20px;
  font-weight: 400;
}

.cache-stats span {
  color: rgba(209, 197, 183, 0.58);
  font-size: 12px;
}

.cache-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.download-concurrency {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  border-top: 1px solid rgba(153, 143, 131, 0.12);
  padding-top: 14px;
}

.download-concurrency p {
  margin-top: 6px;
  font-size: 12px;
}

.tips-list {
  display: grid;
  gap: 8px;
}

.tips-list span {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(153, 143, 131, 0.14);
  border-radius: 12px;
  padding: 10px 12px;
  color: rgba(229, 226, 225, 0.78);
  background: rgba(255, 255, 255, 0.022);
  font-size: 13px;
  line-height: 1.5;
}

.tips-list strong {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
}

.tips-list small {
  color: rgba(209, 197, 183, 0.62);
  font-size: 12px;
}

.tips-list code {
  display: block;
  overflow-wrap: anywhere;
  color: var(--color-accent-bright);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
}

.proxy-help {
  color: rgba(209, 197, 183, 0.58);
  font-size: 12px;
}

.about-card {
  display: grid;
  gap: 14px;
}

.about-link {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  color: var(--color-accent);
  font-size: 13px;
  text-decoration: none;
}

.about-link:active {
  opacity: 0.78;
}

.stepper-control {
  display: grid;
  grid-template-columns: 38px 48px 38px;
  min-width: 124px;
  overflow: hidden;
  border: 1px solid rgba(153, 143, 131, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.stepper-button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 0;
  color: rgba(209, 197, 183, 0.78);
  background: transparent;
  font-size: 20px;
  line-height: 1;
}

.stepper-button:disabled {
  color: rgba(209, 197, 183, 0.26);
}

.stepper-value {
  width: 48px;
  height: 38px;
  padding: 0;
  border-inline: 1px solid rgba(153, 143, 131, 0.14);
  border-block: 0;
  background: transparent;
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 700;
  line-height: 38px;
  text-align: center;
}

.stepper-value:focus {
  outline: 1px solid rgba(225, 194, 150, 0.5);
  outline-offset: -1px;
}

.stepper-value::-webkit-outer-spin-button,
.stepper-value::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.stepper-value[type='number'] {
  appearance: textfield;
}

.credential-input {
  min-height: 86px;
  resize: vertical;
}

.cover-cache-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(209, 197, 183, 0.72);
  font-size: 13px;
}

.cover-cache-toggle input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.import-button {
  min-width: 0;
  padding-inline: 10px;
}

.import-button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.danger-action {
  color: #fca5a5;
}

.hidden-input {
  display: none;
}

.import-message {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--color-accent);
  font-size: 13px;
}

.import-message a {
  color: var(--color-accent-bright);
  text-decoration: none;
}

.status-pill {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 12px;
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.12);
  font-size: 12px;
  white-space: nowrap;
}
</style>
