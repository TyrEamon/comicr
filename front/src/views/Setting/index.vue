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
        placeholder="单本可手动命名，多本会使用文件夹名"
        autocomplete="off"
      />

      <div class="import-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="archiveInput?.click()">
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

      <input ref="archiveInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" @change="handleArchiveImport" />
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
import { cloudService } from '@/services/cloudService'
import { localFolderService } from '@/services/localFolderService'
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, FolderOpen, HardDrive, Images, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

const library = useLibraryStore()
const archiveInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const importTitle = ref('')
const message = ref('')
const busy = ref(false)
const importedManga = ref<{ id: string; title: string } | null>(null)
const cacheStats = ref({ usedBytes: 0, pageBytes: 0, coverBytes: 0, pageCount: 0, coverCount: 0 })
const cacheLimitMb = ref(Math.round(cloudService.getCloudCacheSettings().maxBytes / 1024 / 1024))

onMounted(() => {
  void library.load()
  void refreshCloudCacheStats()
})

function requestedTitle() {
  return importTitle.value.trim() || undefined
}

async function handleArchiveImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  busy.value = true
  importedManga.value = null
  message.value = '正在导入压缩包...'
  try {
    const manga = await library.importArchive(file, requestedTitle())
    importedManga.value = { id: manga.id, title: manga.title }
    message.value = `已导入 ${manga.title}（${manga.imageCount} 页）`
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

    await library.load()
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
