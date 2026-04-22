<template>
  <div class="page settings-page">
    <p class="label-caps">设置</p>
    <h1 class="page-title">设置</h1>
    <p class="page-subtitle">漫画库、导入和 App 构建信息都放在这里。</p>

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
        placeholder="留空自动用文件夹名或文件名"
        autocomplete="off"
      />

      <div class="import-actions">
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="archiveInput?.click()">
          <Archive :size="18" />
          压缩包
        </button>
        <button class="primary-button import-button" type="button" :disabled="busy" @click="folderInput?.click()">
          <FolderOpen :size="18" />
          文件夹
        </button>
        <button class="ghost-button import-button" type="button" :disabled="busy" @click="imageInput?.click()">
          <Images :size="18" />
          图片
        </button>
      </div>

      <input ref="archiveInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" @change="handleArchiveImport" />
      <input ref="folderInput" class="hidden-input" type="file" accept="image/*" multiple webkitdirectory directory @change="handleImageFilesImport($event, '文件夹')" />
      <input ref="imageInput" class="hidden-input" type="file" accept="image/*" multiple @change="handleImageFilesImport($event, '图片')" />

      <div v-if="message" class="import-message">
        <span>{{ message }}</span>
        <RouterLink v-if="importedManga" :to="`/manga/${importedManga.id}`">查看详情</RouterLink>
      </div>
    </section>

    <section class="surface-card setting-card">
      <div>
        <h2>打包方式</h2>
        <p>APK 由 GitHub Actions 构建，本机不需要安装 Android Studio 或 Android SDK。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, FolderOpen, Images } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

const library = useLibraryStore()
const archiveInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const importTitle = ref('')
const message = ref('')
const busy = ref(false)
const importedManga = ref<{ id: string; title: string } | null>(null)

onMounted(() => {
  void library.load()
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

.import-button {
  min-width: 0;
  padding-inline: 10px;
}

.import-button:disabled {
  cursor: wait;
  opacity: 0.58;
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
</style>
