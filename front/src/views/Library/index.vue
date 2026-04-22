<template>
  <div class="page library-page">
    <section class="library-hero">
      <p class="label-caps">书库</p>
      <h1 class="page-title">收藏作品</h1>
      <p class="page-subtitle">导入、下载和云盘同步的漫画都会放在这里。</p>
    </section>

    <section class="toolbar surface-card">
      <input v-model="searchQuery" class="text-input" type="search" placeholder="搜索标题" aria-label="搜索标题" />

      <div class="toolbar-row">
        <select v-model="activeTab" class="select-input" aria-label="书库筛选">
          <option value="all">全部</option>
          <option value="favorite">收藏</option>
          <option value="readLater">稍后看</option>
          <option value="pinned">置顶</option>
        </select>

        <button class="primary-button import-button" type="button" @click="fileInput?.click()">
          <Archive :size="18" />
          导入
        </button>
      </div>

      <input ref="fileInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" @change="handleImport" />
    </section>

    <div v-if="message" class="message">{{ message }}</div>

    <div v-if="library.loading" class="empty-state">正在加载书库...</div>

    <MangaGrid
      v-else-if="visibleMangas.length > 0"
      :mangas="visibleMangas"
      :cover-urls="library.coverUrls"
      :get-shelf-state="library.getShelfState"
      @favorite="library.toggleFavorite"
      @read-later="library.toggleReadLater"
      @pin="library.togglePinned"
    />

    <section v-else class="empty-state surface-card">
      <BookOpen :size="34" />
      <h2>还没有漫画</h2>
      <p>导入一个 ZIP 或 CBZ 文件，就能创建手机端书库里的第一本漫画。</p>
      <button class="primary-button" type="button" @click="fileInput?.click()">导入压缩包</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, BookOpen } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import MangaGrid from './components/MangaGrid.vue'

type LibraryTab = 'all' | 'favorite' | 'readLater' | 'pinned'

const library = useLibraryStore()
const fileInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const activeTab = ref<LibraryTab>('all')
const message = ref('')

onMounted(() => {
  void library.load()
})

const visibleMangas = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return library.mangas
    .filter((manga) => {
      if (query && !manga.title.toLowerCase().includes(query)) {
        return false
      }

      const shelf = library.getShelfState(manga.id)
      if (activeTab.value === 'favorite') return shelf.favorite
      if (activeTab.value === 'readLater') return shelf.readLater
      if (activeTab.value === 'pinned') return shelf.pinned
      return true
    })
    .sort((left, right) => {
      const leftPinned = Number(library.getShelfState(left.id).pinned)
      const rightPinned = Number(library.getShelfState(right.id).pinned)
      return rightPinned - leftPinned || right.updatedAt - left.updatedAt
    })
})

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  message.value = '正在导入压缩包...'
  try {
    const manga = await library.importArchive(file)
    message.value = `已导入 ${manga.title}`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '导入失败'
  } finally {
    input.value = ''
  }
}
</script>

<style scoped>
.library-hero {
  margin-bottom: 22px;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 26px;
  padding: 16px;
}

.toolbar-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
}

.import-button {
  min-width: 128px;
}

.hidden-input {
  display: none;
}

.message {
  margin: 0 0 18px;
  color: var(--color-accent);
  font-size: 13px;
}

.empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  gap: 12px;
  padding: 28px;
  color: rgba(209, 197, 183, 0.7);
  text-align: center;
}

.empty-state h2 {
  margin: 0;
  color: var(--color-text);
  font-weight: 400;
}

.empty-state p {
  max-width: 310px;
  margin: 0;
  line-height: 1.7;
}
</style>
