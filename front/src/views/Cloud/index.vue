<template>
  <div class="page cloud-page">
    <section class="storage-overview">
      <div class="storage-label-row">
        <p class="label-caps">云盘</p>
        <strong class="storage-count">{{ library.count }} 本</strong>
      </div>
    </section>

    <section class="provider-list">
      <article
        v-for="provider in providers"
        :key="provider.id"
        class="provider-card surface-card"
        :class="{ active: selectedProvider === provider.id, dim: !provider.connected }"
      >
        <div class="provider-icon">
          <CloudIcon v-if="provider.connected" :size="28" />
          <CloudOff v-else :size="28" />
        </div>
        <div class="provider-copy">
          <h2>{{ provider.name }}</h2>
          <p>{{ provider.connected ? '已连接' : '未连接' }}</p>
          <small>{{ provider.description }}</small>
        </div>
        <button class="ghost-button setup-button" type="button" @click="selectProvider(provider.id)">
          {{ selectedProvider === provider.id ? '当前' : '打开' }}
        </button>
      </article>
    </section>

    <section v-if="selectedProvider === cloudService.localProviderId" class="local-import surface-card">
      <div>
        <p class="label-caps">本地导入</p>
        <h2>漫画库管理</h2>
        <p>本地 ZIP、文件夹和图片导入已经放到设置页，云盘页现在专注远程 WebDAV 资源。</p>
      </div>
      <RouterLink class="primary-button local-import-link" to="/setting">去设置</RouterLink>
    </section>

    <template v-else>
      <section class="surface-card webdav-config-card">
        <div class="card-head">
          <div>
            <p class="label-caps">WebDAV</p>
            <h2>连接配置</h2>
          </div>
          <button v-if="webDavConnected" class="ghost-button danger-button" type="button" :disabled="busy" @click="disconnectWebDav">
            断开
          </button>
        </div>

        <label class="input-label" for="endpoint-url">地址</label>
        <input
          id="endpoint-url"
          v-model="webDavForm.endpointUrl"
          class="text-input"
          type="url"
          placeholder="https://example.com/dav/"
          autocomplete="off"
        />

        <div class="field-grid">
          <div>
            <label class="input-label" for="username">用户名</label>
            <input id="username" v-model="webDavForm.username" class="text-input" type="text" autocomplete="username" />
          </div>
          <div>
            <label class="input-label" for="password">密码</label>
            <input id="password" v-model="webDavForm.password" class="text-input" type="password" autocomplete="current-password" />
          </div>
        </div>

        <label class="input-label" for="library-path">漫画目录</label>
        <input
          id="library-path"
          v-model="webDavForm.libraryPath"
          class="text-input"
          type="text"
          placeholder="/本子 或留空使用 WebDAV 根目录"
          autocomplete="off"
        />

        <div class="config-actions">
          <button class="primary-button" type="button" :disabled="busy" @click="connectWebDav">
            {{ webDavConnected ? '更新连接' : '连接 WebDAV' }}
          </button>
          <button class="ghost-button" type="button" :disabled="busy || !webDavConnected" @click="refreshWebDavLibrary">
            刷新列表
          </button>
        </div>

        <p class="config-hint">OpenList 通常直接填它给你的 WebDAV 地址；漫画目录留空或填你存放漫画文件夹的相对路径。</p>
        <p v-if="message" class="status-message">{{ message }}</p>
      </section>

      <section v-if="webDavConnected" class="surface-card webdav-library-card">
        <div class="card-head">
          <div>
            <p class="label-caps">远程书架</p>
            <h2>漫画文件夹</h2>
          </div>
          <span class="status-pill">{{ webDavFolders.length }} 项</span>
        </div>

        <div v-if="loadingFolders && webDavFolders.length === 0" class="empty-state compact">正在读取 WebDAV 目录...</div>

        <div v-else-if="webDavFolders.length === 0" class="empty-state compact">
          {{ emptyWebDavText }}
        </div>

        <div v-else class="remote-list">
          <article v-for="folder in webDavFolders" :key="folder.path" class="remote-item">
            <div class="remote-cover">
              <img v-if="previewMap[folder.path]?.coverUrl" :src="previewMap[folder.path]?.coverUrl" :alt="folder.name" loading="lazy" />
              <FolderOpen v-else :size="26" />
            </div>

            <div class="remote-copy">
              <h3>{{ folder.name }}</h3>
              <p>
                {{ formatImageCount(previewMap[folder.path]?.imageCount) }} 页
                <span>·</span>
                {{ formatUpdatedAt(folder.updatedAt) }}
              </p>
            </div>

            <div class="remote-actions">
              <button class="ghost-button action-button" type="button" @click="openWebDavReader(folder.path)">
                <BookOpen :size="16" />
                阅读
              </button>
              <button class="primary-button action-button" type="button" :disabled="downloadButtonDisabled(folder.path)" @click="queueWebDavDownload(folder)">
                <Check v-if="downloadedMap[folder.path]" :size="16" />
                <Download v-else :size="16" />
                {{ downloadButtonText(folder.path) }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { cloudService } from '@/services/cloudService'
import { cloudDownloadService } from '@/services/cloudDownloadService'
import { downloadService } from '@/services/downloadService'
import type { CloudFile, DownloadTask, ProviderSummary, WebDavConfig } from '@/services/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { BookOpen, Check, Cloud as CloudIcon, CloudOff, Download, FolderOpen } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const library = useLibraryStore()

const providers = ref<ProviderSummary[]>([])
const selectedProvider = ref(cloudService.webDavProviderId)
const webDavConnected = ref(false)
const loadingFolders = ref(false)
const webDavLoadFailed = ref(false)
const busy = ref(false)
const message = ref('')
const webDavFolders = ref<CloudFile[]>([])
const previewMap = reactive<Record<string, { imageCount: number; coverUrl: string }>>({})
const downloadedMap = reactive<Record<string, boolean>>({})
const downloadTaskMap = reactive<Record<string, DownloadTask['status']>>({})
const webDavForm = reactive<WebDavConfig>(cloudService.getWebDavConfig())
const emptyWebDavText = computed(() => (
  webDavLoadFailed.value
    ? 'WebDAV 暂时读取失败，可以稍后点刷新列表。'
    : '当前目录下还没有漫画文件夹，或者 WebDAV 路径不对。'
))
let taskPollTimer: number | undefined

onMounted(async () => {
  await library.ensureLoaded()
  await refreshProviders()
  if (webDavConnected.value) {
    await loadCachedWebDavLibrary()
    await refreshWebDavLibrary()
  }
  syncDownloadTaskMap()
  taskPollTimer = window.setInterval(() => {
    syncDownloadedMap()
    syncDownloadTaskMap()
  }, 1200)
})

onUnmounted(() => {
  window.clearInterval(taskPollTimer)
})

async function refreshProviders() {
  providers.value = await cloudService.listProviders()
  webDavConnected.value = providers.value.some((provider) => provider.id === cloudService.webDavProviderId && provider.connected)
  if (!webDavConnected.value) {
    webDavFolders.value = []
  }
}

function selectProvider(providerId: string) {
  selectedProvider.value = providerId
}

async function connectWebDav() {
  busy.value = true
  message.value = '正在测试 WebDAV 连接...'
  try {
    await cloudService.connectWebDav({ ...webDavForm })
    message.value = 'WebDAV 已连接'
    await refreshProviders()
    await refreshWebDavLibrary()
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'WebDAV 连接失败'
  } finally {
    busy.value = false
  }
}

async function disconnectWebDav() {
  cloudService.disconnectWebDav()
  Object.keys(previewMap).forEach((key) => delete previewMap[key])
  webDavFolders.value = []
  webDavLoadFailed.value = false
  message.value = 'WebDAV 已断开'
  await refreshProviders()
  await library.refresh()
}

async function refreshWebDavLibrary() {
  loadingFolders.value = true
  webDavLoadFailed.value = false
  message.value = webDavConnected.value ? '正在读取远程漫画目录...' : message.value
  try {
    const items = await cloudService.refreshWebDavMangaIndex('', (progress) => {
      message.value = `正在读取封面和页数 ${progress.current}/${progress.total}`
    })
    applyWebDavMangaItems(items)
    Object.keys(previewMap).forEach((key) => delete previewMap[key])
    items.forEach((item) => {
      previewMap[item.path] = { imageCount: item.imageCount, coverUrl: item.coverUrl }
    })
    await library.refresh()
    message.value = webDavFolders.value.length > 0 ? '远程漫画目录已刷新' : 'WebDAV 已连接，但当前目录还没有漫画文件夹'
  } catch (error) {
    webDavLoadFailed.value = true
    message.value = error instanceof Error ? error.message : '读取 WebDAV 目录失败'
  } finally {
    loadingFolders.value = false
  }
}

async function loadCachedWebDavLibrary() {
  const items = await cloudService.getCachedWebDavMangaItems()
  if (items.length === 0) return

  applyWebDavMangaItems(items)
  Object.keys(previewMap).forEach((key) => delete previewMap[key])
  items.forEach((item) => {
    previewMap[item.path] = { imageCount: item.imageCount, coverUrl: item.coverUrl }
  })
}

function applyWebDavMangaItems(items: Awaited<ReturnType<typeof cloudService.getCachedWebDavMangaItems>>) {
  webDavFolders.value = items.map((item) => ({
    id: item.id,
    name: item.title,
    path: item.path,
    isDir: true,
    sizeBytes: item.sizeBytes,
    updatedAt: item.updatedAt,
  }))
  syncDownloadedMap()
}

function syncDownloadedMap() {
  let changed = false
  const previousMap = { ...downloadedMap }
  Object.keys(downloadedMap).forEach((key) => delete downloadedMap[key])
  webDavFolders.value.forEach((folder) => {
    const downloaded = cloudDownloadService.isWebDavDownloaded(folder.path)
    if (previousMap[folder.path] !== downloaded) {
      changed = true
    }
    downloadedMap[folder.path] = downloaded
  })
  if (changed) {
    void library.refresh()
  }
}

function syncDownloadTaskMap() {
  Object.keys(downloadTaskMap).forEach((key) => delete downloadTaskMap[key])
  webDavFolders.value.forEach((folder) => {
    const task = downloadService.findActiveWebDavTask(folder.path)
    if (task) {
      downloadTaskMap[folder.path] = task.status
    }
  })
}

async function openWebDavReader(path: string) {
  busy.value = true
  message.value = '正在准备在线阅读...'
  try {
    const readerId = cloudService.buildWebDavReaderId(path)
    router.push({ name: 'reader', params: { id: readerId } })
  } finally {
    busy.value = false
  }
}

async function queueWebDavDownload(folder: CloudFile) {
  try {
    const task = await downloadService.startWebDav(folder.path, folder.name)
    downloadTaskMap[folder.path] = task.status
    message.value = task.status === 'pending' ? `已加入下载队列：${folder.name}` : `下载任务已存在：${folder.name}`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '创建下载任务失败'
  }
}

function downloadButtonDisabled(path: string) {
  return Boolean(downloadedMap[path] || downloadTaskMap[path])
}

function downloadButtonText(path: string) {
  if (downloadedMap[path]) return '已下载'
  if (downloadTaskMap[path] === 'downloading' || downloadTaskMap[path] === 'parsing') return '下载中'
  if (downloadTaskMap[path]) return '队列中'
  return '下载'
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString()
}

function formatImageCount(value?: number) {
  return value && value > 0 ? String(value) : '--'
}
</script>

<style scoped>
.storage-overview {
  margin-bottom: 20px;
}

.storage-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.storage-count {
  color: var(--color-accent-bright);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  white-space: nowrap;
}

.provider-list {
  display: grid;
  gap: 14px;
}

.provider-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 20px;
}

.provider-card.active {
  border-color: rgba(225, 194, 150, 0.24);
}

.provider-card.dim {
  opacity: 0.68;
}

.provider-icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 14px;
  color: var(--color-accent);
  background: var(--color-surface-high);
}

.provider-copy h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 400;
}

.provider-copy p {
  margin: 6px 0;
  color: #34d399;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.provider-copy small {
  display: block;
  color: rgba(209, 197, 183, 0.55);
  line-height: 1.6;
}

.setup-button {
  min-height: 40px;
  padding-inline: 14px;
}

.local-import,
.webdav-config-card,
.webdav-library-card {
  display: grid;
  gap: 18px;
  margin-top: 26px;
  padding: 22px;
}

.local-import h2,
.webdav-config-card h2,
.webdav-library-card h2 {
  margin: 8px 0 0;
  font-size: 24px;
  font-weight: 400;
}

.local-import p:not(.label-caps) {
  margin: 0;
  color: rgba(209, 197, 183, 0.66);
  line-height: 1.7;
}

.local-import-link {
  text-decoration: none;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.input-label {
  color: rgba(209, 197, 183, 0.72);
  font-size: 13px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.config-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.config-hint,
.status-message {
  margin: 0;
  color: rgba(209, 197, 183, 0.64);
  font-size: 13px;
  line-height: 1.7;
}

.status-message {
  color: var(--color-accent-bright);
}

.danger-button {
  color: #fca5a5;
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

.empty-state.compact {
  min-height: 160px;
  display: grid;
  place-items: center;
  color: rgba(209, 197, 183, 0.66);
  text-align: center;
}

.remote-list {
  display: grid;
  gap: 14px;
}

.remote-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(153, 143, 131, 0.14);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.01);
}

.remote-cover {
  display: grid;
  width: 72px;
  aspect-ratio: 3 / 4;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  color: rgba(209, 197, 183, 0.42);
  background: var(--color-surface-high);
}

.remote-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remote-copy {
  min-width: 0;
}

.remote-copy h3 {
  margin: 0;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  word-break: break-word;
}

.remote-copy p {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 8px 0 0;
  color: rgba(209, 197, 183, 0.58);
  font-size: 12px;
}

.remote-actions {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.action-button {
  min-height: 44px;
  justify-content: center;
  gap: 8px;
}
</style>
