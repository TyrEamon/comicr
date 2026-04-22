<template>
  <div class="page settings-page">
    <p class="label-caps">设置</p>
    <h1 class="page-title">设置</h1>

    <section class="surface-card setting-card library-card">
      <div class="setting-card-header">
        <div>
          <h2>漫画库</h2>
          <p>{{ library.count }} 本漫画</p>
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
          扫描
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="imageInput?.click()">
          <Images :size="18" />
          图片
        </button>
      </div>

      <input ref="archiveInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" multiple @change="handleArchiveImport" />
      <input ref="imageInput" class="hidden-input" type="file" accept="image/*" multiple @change="handleImageFilesImport($event, '图片')" />

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
          <h2>下载位置</h2>
          <p>{{ downloadTargetLabel }} · {{ downloadConcurrency }} 线程</p>
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
          <label class="input-label">下载线程数</label>
          <p>只影响单本漫画内部同时下载的图片数量</p>
        </div>
        <div class="concurrency-options" role="group" aria-label="下载线程数">
          <button
            v-for="value in downloadConcurrencyOptions"
            :key="value"
            class="setting-chip"
            :class="{ active: downloadConcurrency === value }"
            type="button"
            @click="setDownloadConcurrency(value)"
          >
            {{ value }}
          </button>
        </div>
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

    <section class="surface-card setting-card">
      <div>
        <h2>打包方式</h2>
        <p>GitHub Actions · Debug APK</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { archiveService } from '@/services/archiveService'
import { cloudDownloadService } from '@/services/cloudDownloadService'
import { cloudService } from '@/services/cloudService'
import { downloadTargetService } from '@/services/downloadTargetService'
import { localFolderService } from '@/services/localFolderService'
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, FolderOpen, HardDrive, Images, RotateCcw, Trash2 } from 'lucide-vue-next'
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
const downloadConcurrency = ref(cloudDownloadService.getDownloadSettings().concurrency)
const downloadConcurrencyOptions = [1, 2, 3]
const downloadTargetVersion = ref(0)
const downloadTargetAvailable = downloadTargetService.isAvailable()
const downloadTargetLabel = computed(() => {
  downloadTargetVersion.value
  return downloadTargetService.getTargetLabel()
})
const hasCustomDownloadTarget = computed(() => {
  downloadTargetVersion.value
  return Boolean(downloadTargetService.getTarget())
})

onMounted(() => {
  void library.ensureLoaded()
  void refreshCloudCacheStats()
})

function requestedTitle() {
  return importTitle.value.trim() || undefined
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
    let lastManga: { id: string; title: string } | null = null

    for (const [index, archive] of archives.entries()) {
      const title = archives.length === 1 ? manualTitle || archive.title : archive.title
      message.value = `正在保存压缩包索引 ${index + 1}/${archives.length}：${title}`
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
    message.value = archives.length === 1 && lastManga
      ? `已添加 ${lastManga.title}（${totalImages} 页，不解压不复制）${skipped}`
      : `已添加 ${archives.length} 本压缩包漫画，共 ${totalImages} 页，不解压不复制${skipped}`
    importTitle.value = ''
  } catch (error) {
    message.value = error instanceof Error ? error.message : '压缩包索引失败'
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
    message.value = error instanceof Error ? error.message : '导入失败'
  } finally {
    busy.value = false
    input.value = ''
  }
}

async function handleImageFilesImport(event: Event, label: string) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (files.length === 0) return

  busy.value = true
  importedManga.value = null
  message.value = `正在导入${label}...`
  try {
    const manga = await library.importImageFiles(files, requestedTitle())
    importedManga.value = { id: manga.id, title: manga.title }
    message.value = `已导入 ${manga.title}（${manga.imageCount} 页）`
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
    const manualTitle = requestedTitle()
    let totalImages = 0
    let lastManga: { id: string; title: string } | null = null

    for (const [index, folder] of folders.entries()) {
      const title = folders.length === 1 ? manualTitle || folder.title : folder.title
      message.value = `正在保存索引 ${index + 1}/${folders.length}：${title}`
      const manga = await library.importImageRefs(title, folder.images)
      totalImages += manga.imageCount
      lastManga = { id: manga.id, title: manga.title }
    }

    await library.refresh()
    importedManga.value = folders.length === 1 ? lastManga : null
    message.value = folders.length === 1 && lastManga
      ? `已添加 ${lastManga.title}（${totalImages} 页，不复制原图）`
      : `已添加 ${folders.length} 本漫画，共 ${totalImages} 页，不复制原图`
    importTitle.value = ''
  } catch (error) {
    message.value = error instanceof Error ? error.message : '文件夹导入失败'
  } finally {
    busy.value = false
  }
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

function setDownloadConcurrency(value: number) {
  const settings = cloudDownloadService.updateDownloadSettings({ concurrency: value })
  downloadConcurrency.value = settings.concurrency
  message.value = `下载线程数已设置为 ${settings.concurrency}`
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
    await cloudService.clearCloudCache()
    await refreshCloudCacheStats()
    message.value = '云盘缓存已清理'
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  gap: 10px;
  border-top: 1px solid rgba(153, 143, 131, 0.12);
  padding-top: 14px;
}

.download-concurrency p {
  margin-top: 6px;
  font-size: 12px;
}

.concurrency-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.setting-chip {
  min-height: 42px;
  border: 1px solid rgba(153, 143, 131, 0.18);
  border-radius: 14px;
  color: rgba(209, 197, 183, 0.78);
  background: rgba(255, 255, 255, 0.02);
}

.setting-chip.active {
  color: #21180f;
  border-color: transparent;
  background: var(--color-accent);
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
