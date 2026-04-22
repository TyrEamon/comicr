<template>
  <div class="page library-page">
    <section class="library-hero">
      <p class="label-caps">书库</p>
    </section>

    <nav class="library-tabs" aria-label="书库视图">
      <button
        v-for="tab in tabItems"
        :key="tab.id"
        class="library-tab"
        :class="{ active: activeTab === tab.id }"
        type="button"
        @click="setActiveTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <div
      class="library-swipe-area"
      @touchstart.passive="handleTouchStart"
      @touchend.passive="handleTouchEnd"
      @pointerdown="handlePointerStart"
      @pointerup="handlePointerEnd"
      @pointercancel="handlePointerCancel"
    >
      <Transition :name="contentTransitionName" mode="out-in">
        <div :key="activeTab" class="library-tab-panel">
          <div v-if="library.loading && library.mangas.length === 0" class="empty-state">正在加载书库...</div>

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
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLibraryStore } from '@/stores/libraryStore'
import { BookOpen } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import MangaGrid from './components/MangaGrid.vue'

type LibraryTab = 'all' | 'favorite' | 'readLater' | 'cloud'

interface LibraryViewState {
  activeTab: LibraryTab
  scrollByTab: Record<LibraryTab, number>
  restoreOnNextEntry: boolean
}

const LIBRARY_VIEW_STATE_KEY = 'comicr:library-view-state:v1'
const library = useLibraryStore()
const tabItems: Array<{ id: LibraryTab, label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'favorite', label: '收藏' },
  { id: 'readLater', label: '稍后看' },
  { id: 'cloud', label: '云盘' },
]
const initialViewState = loadLibraryViewState()
const searchQuery = ref('')
const activeTab = ref<LibraryTab>(initialViewState.activeTab)
const scrollByTab = ref<Record<LibraryTab, number>>(initialViewState.scrollByTab)
const contentTransitionName = ref('library-slide-next')
const touchStartX = ref(0)
const touchStartY = ref(0)
const pointerStartX = ref(0)
const pointerStartY = ref(0)
const pointerTracking = ref(false)

onMounted(() => {
  void restoreLibraryView()
  window.addEventListener('app-search', handleAppSearch)
})

onBeforeUnmount(() => {
  window.removeEventListener('app-search', handleAppSearch)
})

onBeforeRouteLeave((to) => {
  if (to.name === 'manga-detail' || to.name === 'reader') {
    saveCurrentViewState()
    return
  }

  clearViewState()
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
      if (activeTab.value === 'cloud') return manga.source === 'cloud'
      return true
    })
    .sort((left, right) => {
      const leftPinned = Number(library.getShelfState(left.id).pinned)
      const rightPinned = Number(library.getShelfState(right.id).pinned)
      return rightPinned - leftPinned || right.updatedAt - left.updatedAt
    })
})

function handleAppSearch(event: Event) {
  searchQuery.value = String((event as CustomEvent<string>).detail ?? '')
}

function setActiveTab(tab: LibraryTab) {
  if (tab === activeTab.value) return
  captureCurrentScroll()

  const currentIndex = tabItems.findIndex((item) => item.id === activeTab.value)
  const nextIndex = tabItems.findIndex((item) => item.id === tab)
  contentTransitionName.value = nextIndex >= currentIndex ? 'library-slide-next' : 'library-slide-prev'
  activeTab.value = tab
  void nextTick(() => restoreScrollForTab(tab))
}

function switchTabByOffset(offset: number) {
  const currentIndex = tabItems.findIndex((item) => item.id === activeTab.value)
  const nextIndex = Math.min(tabItems.length - 1, Math.max(0, currentIndex + offset))
  if (nextIndex === currentIndex) return
  setActiveTab(tabItems[nextIndex].id)
}

function handleSwipe(deltaX: number, deltaY: number) {
  if (Math.abs(deltaX) < 58 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return
  switchTabByOffset(deltaX < 0 ? 1 : -1)
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  handleSwipe(touch.clientX - touchStartX.value, touch.clientY - touchStartY.value)
}

function handlePointerStart(event: PointerEvent) {
  if (event.pointerType === 'touch') return
  pointerTracking.value = true
  pointerStartX.value = event.clientX
  pointerStartY.value = event.clientY
}

function handlePointerEnd(event: PointerEvent) {
  if (!pointerTracking.value || event.pointerType === 'touch') return
  pointerTracking.value = false
  handleSwipe(event.clientX - pointerStartX.value, event.clientY - pointerStartY.value)
}

function handlePointerCancel() {
  pointerTracking.value = false
}

function emptyScrollByTab(): Record<LibraryTab, number> {
  return {
    all: 0,
    favorite: 0,
    readLater: 0,
    cloud: 0,
  }
}

function isLibraryTab(value: unknown): value is LibraryTab {
  return tabItems.some((item) => item.id === value)
}

function loadLibraryViewState(): LibraryViewState {
  try {
    const rawValue = sessionStorage.getItem(LIBRARY_VIEW_STATE_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) as Partial<LibraryViewState> : {}
    if (!parsed.restoreOnNextEntry) {
      throw new Error('No restorable library state')
    }

    const scrollState = {
      ...emptyScrollByTab(),
      ...(parsed.scrollByTab ?? {}),
    }
    return {
      activeTab: isLibraryTab(parsed.activeTab) ? parsed.activeTab : 'all',
      scrollByTab: {
        all: Number(scrollState.all) || 0,
        favorite: Number(scrollState.favorite) || 0,
        readLater: Number(scrollState.readLater) || 0,
        cloud: Number(scrollState.cloud) || 0,
      },
      restoreOnNextEntry: true,
    }
  } catch {
    return {
      activeTab: 'all',
      scrollByTab: emptyScrollByTab(),
      restoreOnNextEntry: false,
    }
  }
}

function persistViewState() {
  sessionStorage.setItem(LIBRARY_VIEW_STATE_KEY, JSON.stringify({
    activeTab: activeTab.value,
    scrollByTab: scrollByTab.value,
    restoreOnNextEntry: true,
  }))
}

function clearViewState() {
  sessionStorage.removeItem(LIBRARY_VIEW_STATE_KEY)
}

function captureCurrentScroll() {
  scrollByTab.value = {
    ...scrollByTab.value,
    [activeTab.value]: window.scrollY,
  }
}

function saveCurrentViewState() {
  captureCurrentScroll()
  persistViewState()
}

function restoreScrollForTab(tab = activeTab.value) {
  const top = scrollByTab.value[tab] ?? 0
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.scrollTo({ top, behavior: 'auto' })
    })
  })
}

async function restoreLibraryView() {
  await library.ensureLoaded()
  await nextTick()
  restoreScrollForTab()
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

.library-swipe-area {
  min-height: 300px;
  touch-action: pan-y;
}

.library-tab-panel {
  min-height: 300px;
}

.library-slide-next-enter-active,
.library-slide-next-leave-active,
.library-slide-prev-enter-active,
.library-slide-prev-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.library-slide-next-enter-from,
.library-slide-prev-leave-to {
  opacity: 0;
  transform: translate3d(18px, 0, 0);
}

.library-slide-next-leave-to,
.library-slide-prev-enter-from {
  opacity: 0;
  transform: translate3d(-18px, 0, 0);
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
