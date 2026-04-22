<template>
  <div class="page library-page">
    <section class="library-hero">
      <p class="label-caps">书库</p>
      <h1 class="page-title">收藏作品</h1>
      <p class="page-subtitle">导入、下载和云盘同步的漫画都会放在这里。</p>
    </section>

    <nav class="library-tabs" aria-label="书库视图">
      <button
        v-for="tab in tabItems"
        :key="tab.id"
        class="library-tab"
        :class="{ active: activeTab === tab.id }"
        type="button"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </nav>

    <section class="toolbar surface-card">
      <input ref="searchInput" v-model="searchQuery" class="text-input" type="search" placeholder="搜索漫画标题" aria-label="搜索漫画标题" />
    </section>

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
      <p>到设置里的漫画库导入第一本漫画。</p>
      <div class="empty-actions">
        <RouterLink class="primary-button" to="/setting">去设置</RouterLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useLibraryStore } from '@/stores/libraryStore'
import { BookOpen } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import MangaGrid from './components/MangaGrid.vue'

type LibraryTab = 'all' | 'favorite' | 'readLater' | 'download'

const route = useRoute()
const library = useLibraryStore()
const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const activeTab = ref<LibraryTab>('all')
const tabItems: Array<{ id: LibraryTab, label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'favorite', label: '收藏' },
  { id: 'readLater', label: '稍后看' },
  { id: 'download', label: '下载' },
]

onMounted(() => {
  void library.load()
  window.addEventListener('focus-library-search', focusSearchInput)
  if (route.query.focusSearch) {
    focusSearchInput()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('focus-library-search', focusSearchInput)
})

watch(() => route.query.focusSearch, (value) => {
  if (value) {
    focusSearchInput()
  }
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
      if (activeTab.value === 'download') return manga.source === 'download'
      return true
    })
    .sort((left, right) => {
      const leftPinned = Number(library.getShelfState(left.id).pinned)
      const rightPinned = Number(library.getShelfState(right.id).pinned)
      return rightPinned - leftPinned || right.updatedAt - left.updatedAt
    })
})

function focusSearchInput() {
  void nextTick(() => {
    searchInput.value?.focus()
  })
}
</script>

<style scoped>
.library-hero {
  margin-bottom: 22px;
}

.library-tabs {
  display: flex;
  gap: 20px;
  margin: 0 -20px 18px;
  overflow-x: auto;
  padding: 0 20px 4px;
  scrollbar-width: none;
}

.library-tabs::-webkit-scrollbar {
  display: none;
}

.library-tab {
  position: relative;
  min-height: 44px;
  flex: 0 0 auto;
  border: 0;
  padding: 0;
  color: rgba(209, 197, 183, 0.56);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.library-tab::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--color-accent-bright);
  content: "";
  opacity: 0;
  transform: scaleX(0.5);
  transition: opacity 180ms ease, transform 180ms ease;
}

.library-tab.active {
  color: var(--color-accent-bright);
}

.library-tab.active::after {
  opacity: 1;
  transform: scaleX(1);
}

.toolbar {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 26px;
  padding: 16px;
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

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.empty-actions a {
  text-decoration: none;
}
</style>
