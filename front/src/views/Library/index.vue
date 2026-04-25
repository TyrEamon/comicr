<template>
  <div class="page library-page">
    <section class="library-hero">
      <p class="label-caps">书库</p>

      <div class="library-controls" aria-label="书库工具">
        <div ref="sortPanelRef" class="sort-control">
          <button
            class="sort-button"
            :class="{ active: sortPanelVisible }"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="sortPanelVisible"
            @click="toggleSortPanel"
          >
            <ArrowDownAZ :size="16" class="sort-button-icon" aria-hidden="true" />
            <span>{{ sortModeLabel }}</span>
            <ChevronDown :size="15" class="sort-button-chevron" aria-hidden="true" />
          </button>

          <Transition name="library-popover">
            <div v-if="sortPanelVisible" class="sort-popover surface-card" role="menu" aria-label="排序方式" @keydown.escape.stop="sortPanelVisible = false">
              <button
                v-for="option in sortOptions"
                :key="option.id"
                class="sort-option"
                :class="{ active: sortMode === option.id }"
                type="button"
                role="menuitemradio"
                :aria-checked="sortMode === option.id"
                @click="selectSortMode(option.id)"
              >
                <span>{{ option.label }}</span>
                <Check v-if="sortMode === option.id" :size="16" aria-hidden="true" />
              </button>
            </div>
          </Transition>
        </div>

        <div ref="filterPanelRef" class="filter-control">
          <button
            class="filter-button"
            :class="{ active: filterPanelVisible || activeAllFilterCount < allFilterOptions.length }"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="filterPanelVisible"
            @click="toggleFilterPanel"
          >
            <SlidersHorizontal :size="16" class="filter-button-icon" aria-hidden="true" />
            <span>过滤设置</span>
          </button>

          <Transition name="library-popover">
            <div v-if="filterPanelVisible" class="filter-popover surface-card" role="menu" @keydown.escape.stop="filterPanelVisible = false">
              <label v-for="option in allFilterOptions" :key="option.id" class="filter-option">
                <input
                  type="checkbox"
                  :checked="allFilters[option.id]"
                  @change="handleAllFilterChange(option.id, $event)"
                >
                <span>{{ option.label }}</span>
                <Check v-if="allFilters[option.id]" :size="15" aria-hidden="true" />
              </label>
            </div>
          </Transition>
        </div>
      </div>
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
            <h2>{{ emptyTitle }}</h2>
            <p>{{ emptyDescription }}</p>
            <div v-if="showImportAction" class="empty-actions">
              <RouterLink class="primary-button" to="/setting">去设置</RouterLink>
            </div>
          </section>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { searchService } from '@/services/searchService'
import { libraryService } from '@/services/libraryService'
import type { MangaItem } from '@/services/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { ArrowDownAZ, BookOpen, Check, ChevronDown, SlidersHorizontal } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import MangaGrid from './components/MangaGrid.vue'

type LibraryTab = 'all' | 'favorite' | 'readLater' | 'history' | 'novel' | 'cloud'
type LibrarySortMode = 'name' | 'addedAt' | 'recent'
type AllFilterKey = 'localManga' | 'cloudManga' | 'novel'

interface LibraryViewState {
  activeTab: LibraryTab
  scrollByTab: Record<LibraryTab, number>
  restoreOnNextEntry: boolean
}

interface LibraryPreferences {
  sortMode: LibrarySortMode
  allFilters: Record<AllFilterKey, boolean>
}

const LIBRARY_VIEW_STATE_KEY = 'comicr:library-view-state:v1'
const LIBRARY_PREFERENCES_KEY = 'comicr:library-preferences:v1'

const tabItems: Array<{ id: LibraryTab, label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'favorite', label: '收藏' },
  { id: 'readLater', label: '稍后看' },
  { id: 'history', label: '历史' },
  { id: 'novel', label: '小说' },
  { id: 'cloud', label: '云盘' },
]

const sortOptions: Array<{ id: LibrarySortMode, label: string }> = [
  { id: 'name', label: '默认排序' },
  { id: 'addedAt', label: '加入时间' },
  { id: 'recent', label: '最近阅读' },
]

const allFilterOptions: Array<{ id: AllFilterKey, label: string }> = [
  { id: 'localManga', label: '本地漫画' },
  { id: 'cloudManga', label: '云盘漫画' },
  { id: 'novel', label: '小说' },
]

const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' })
const library = useLibraryStore()
const initialViewState = loadLibraryViewState()
const initialPreferences = loadLibraryPreferences()
const searchQuery = ref('')
const activeTab = ref<LibraryTab>(initialViewState.activeTab)
const scrollByTab = ref<Record<LibraryTab, number>>(initialViewState.scrollByTab)
const contentTransitionName = ref('library-slide-next')
const sortMode = ref<LibrarySortMode>(initialPreferences.sortMode)
const allFilters = ref<Record<AllFilterKey, boolean>>(initialPreferences.allFilters)
const sortPanelVisible = ref(false)
const filterPanelVisible = ref(false)
const sortPanelRef = ref<HTMLElement | null>(null)
const filterPanelRef = ref<HTMLElement | null>(null)
const touchStartX = ref(0)
const touchStartY = ref(0)
const pointerStartX = ref(0)
const pointerStartY = ref(0)
const pointerTracking = ref(false)

const activeAllFilterCount = computed(() => allFilterOptions.filter((option) => allFilters.value[option.id]).length)
const sortModeLabel = computed(() => sortOptions.find((option) => option.id === sortMode.value)?.label ?? '默认排序')

const visibleMangas = computed(() => {
  const query = searchQuery.value.trim()

  return library.mangas
    .filter((manga) => {
      if (query && !searchService.matchesText(manga.title, query)) {
        return false
      }

      const shelf = library.getShelfState(manga.id)
      if (activeTab.value === 'favorite') return shelf.favorite
      if (activeTab.value === 'readLater') return shelf.readLater
      if (activeTab.value === 'history') return hasReadingProgress(manga)
      if (activeTab.value === 'novel') return isNovel(manga)
      if (activeTab.value === 'cloud') return isCloudManga(manga)

      return allFilterEnabledFor(manga)
    })
    .sort(compareMangas)
})

const emptyTitle = computed(() => {
  if (searchQuery.value.trim()) return '没有匹配的作品'
  if (activeTab.value === 'favorite') return '还没有收藏'
  if (activeTab.value === 'readLater') return '稍后看是空的'
  if (activeTab.value === 'history') return '还没有阅读历史'
  if (activeTab.value === 'novel') return '还没有小说'
  if (activeTab.value === 'cloud') return '还没有云盘漫画'
  if (activeAllFilterCount.value === 0) return '全部过滤已清空'
  return '还没有漫画'
})

const emptyDescription = computed(() => {
  if (searchQuery.value.trim()) return '换一个关键词，或者清空搜索后再看。'
  if (activeTab.value === 'history') return '读过漫画或小说后，这里会按阅读记录展示。'
  if (activeTab.value === 'novel') return '导入 EPUB 或 TXT 后，小说会出现在这里。'
  if (activeTab.value === 'cloud') return '连接并刷新 WebDAV 后，云盘漫画会出现在这里。'
  if (activeAllFilterCount.value === 0 && activeTab.value === 'all') return '打开过滤设置，至少勾选一种内容。'
  return '到设置里的漫画库导入第一本漫画。'
})

const showImportAction = computed(() => !searchQuery.value.trim() && activeTab.value !== 'history')

onMounted(() => {
  void restoreLibraryView()
  window.addEventListener('app-search', handleAppSearch)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('app-search', handleAppSearch)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeRouteLeave((to) => {
  if (to.name === 'manga-detail' || to.name === 'reader') {
    saveCurrentViewState()
    return
  }

  clearViewState()
})

watch([sortMode, allFilters], () => {
  saveLibraryPreferences()
}, { deep: true })

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
  sortPanelVisible.value = false
  filterPanelVisible.value = false
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

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (sortPanelRef.value?.contains(target)) return
  if (filterPanelRef.value?.contains(target)) return
  sortPanelVisible.value = false
  filterPanelVisible.value = false
}

function toggleSortPanel() {
  sortPanelVisible.value = !sortPanelVisible.value
  if (sortPanelVisible.value) {
    filterPanelVisible.value = false
  }
}

function selectSortMode(mode: LibrarySortMode) {
  sortMode.value = mode
  sortPanelVisible.value = false
}

function toggleFilterPanel() {
  filterPanelVisible.value = !filterPanelVisible.value
  if (filterPanelVisible.value) {
    sortPanelVisible.value = false
  }
}

function handleAllFilterChange(filter: AllFilterKey, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  allFilters.value = {
    ...allFilters.value,
    [filter]: target.checked,
  }
}

function emptyScrollByTab(): Record<LibraryTab, number> {
  return {
    all: 0,
    favorite: 0,
    readLater: 0,
    history: 0,
    novel: 0,
    cloud: 0,
  }
}

function isLibraryTab(value: unknown): value is LibraryTab {
  return tabItems.some((item) => item.id === value)
}

function isLibrarySortMode(value: unknown): value is LibrarySortMode {
  return sortOptions.some((item) => item.id === value)
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
        history: Number(scrollState.history) || 0,
        novel: Number(scrollState.novel) || 0,
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

function loadLibraryPreferences(): LibraryPreferences {
  try {
    const rawValue = localStorage.getItem(LIBRARY_PREFERENCES_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) as Partial<LibraryPreferences> : {}
    const parsedFilters = (parsed.allFilters ?? {}) as Partial<Record<AllFilterKey, boolean>>
    return {
      sortMode: isLibrarySortMode(parsed.sortMode) ? parsed.sortMode : 'name',
      allFilters: {
        localManga: parsedFilters.localManga !== false,
        cloudManga: parsedFilters.cloudManga !== false,
        novel: parsedFilters.novel !== false,
      },
    }
  } catch {
    return {
      sortMode: 'name',
      allFilters: {
        localManga: true,
        cloudManga: true,
        novel: true,
      },
    }
  }
}

function saveLibraryPreferences() {
  localStorage.setItem(LIBRARY_PREFERENCES_KEY, JSON.stringify({
    sortMode: sortMode.value,
    allFilters: allFilters.value,
  }))
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

function isNovel(manga: MangaItem) {
  return manga.source === 'epub' || manga.source === 'txt' || /\.(epub|txt)$/i.test(manga.localPath)
}

function isCloudManga(manga: MangaItem) {
  return manga.source === 'cloud'
}

function isLocalManga(manga: MangaItem) {
  return !isCloudManga(manga) && !isNovel(manga)
}

function allFilterEnabledFor(manga: MangaItem) {
  if (isNovel(manga)) return allFilters.value.novel
  if (isCloudManga(manga)) return allFilters.value.cloudManga
  if (isLocalManga(manga)) return allFilters.value.localManga
  return true
}

function hasReadingProgress(manga: MangaItem) {
  return Boolean(libraryService.getProgress(manga.id)?.updatedAt)
}

function progressUpdatedAt(manga: MangaItem) {
  return libraryService.getProgress(manga.id)?.updatedAt ?? 0
}

function compareMangas(left: MangaItem, right: MangaItem) {
  if (sortMode.value === 'recent') {
    return progressUpdatedAt(right) - progressUpdatedAt(left)
      || comparePinned(left, right)
      || compareByName(left, right)
  }

  return comparePinned(left, right)
    || (sortMode.value === 'addedAt' ? right.addedAt - left.addedAt : compareByName(left, right))
    || right.updatedAt - left.updatedAt
}

function comparePinned(left: MangaItem, right: MangaItem) {
  const leftPinned = Number(library.getShelfState(left.id).pinned)
  const rightPinned = Number(library.getShelfState(right.id).pinned)
  return rightPinned - leftPinned
}

function compareByName(left: MangaItem, right: MangaItem) {
  return collator.compare(left.title, right.title)
}
</script>

<style scoped>
.library-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.library-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sort-control {
  position: relative;
}

.sort-button {
  display: inline-flex;
  min-height: 44px;
  min-width: 0;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(153, 143, 131, 0.24);
  border-radius: 14px;
  padding: 0 13px;
  color: var(--color-soft);
  background: rgba(21, 21, 21, 0.72);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  transform: translate3d(0, 0, 0);
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.sort-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sort-button.active,
.sort-button:hover,
.sort-button:focus-visible {
  border-color: rgba(225, 194, 150, 0.5);
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.1);
  outline: none;
}

.sort-button:active {
  transform: translate3d(0, 1px, 0) scale(0.992);
}

.sort-button-icon,
.sort-button-chevron,
.filter-button-icon {
  flex-shrink: 0;
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease;
  will-change: transform;
}

.sort-button.active .sort-button-icon {
  transform: translate3d(0, -1px, 0);
}

.sort-button.active .sort-button-chevron {
  transform: rotate(180deg);
}

.sort-popover {
  position: absolute;
  left: 0;
  top: calc(100% + 10px);
  z-index: 8;
  width: min(238px, calc(100vw - 40px));
  padding: 8px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  transform-origin: 28px top;
  will-change: opacity, transform;
}

.sort-popover::before {
  position: absolute;
  left: 24px;
  top: -6px;
  width: 10px;
  height: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--color-surface);
  content: "";
  transform: rotate(45deg);
}

.sort-option {
  display: grid;
  width: 100%;
  min-height: 48px;
  grid-template-columns: 1fr 20px;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 10px;
  padding: 0 12px;
  color: rgba(209, 197, 183, 0.78);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transform: translate3d(0, 0, 0);
  transition: color 160ms ease, background 160ms ease, transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sort-option:hover,
.sort-option:focus-visible {
  color: var(--color-text);
  background: rgba(184, 155, 114, 0.08);
  outline: none;
}

.sort-option.active {
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.12);
}

.sort-option:active {
  transform: translate3d(2px, 0, 0);
}

.filter-control {
  position: relative;
}

.filter-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(153, 143, 131, 0.24);
  border-radius: 14px;
  padding: 0 12px;
  color: rgba(209, 197, 183, 0.72);
  background: rgba(21, 21, 21, 0.72);
  cursor: pointer;
  transform: translate3d(0, 0, 0);
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.filter-button.active {
  border-color: rgba(225, 194, 150, 0.5);
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.1);
}

.filter-button:hover,
.filter-button:focus-visible {
  border-color: rgba(225, 194, 150, 0.5);
  color: var(--color-accent-bright);
  outline: none;
}

.filter-button:active {
  transform: translate3d(0, 1px, 0) scale(0.992);
}

.filter-button.active .filter-button-icon {
  transform: translate3d(0, -1px, 0);
}

.filter-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  z-index: 8;
  width: 176px;
  padding: 8px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
  transform-origin: calc(100% - 24px) top;
  will-change: opacity, transform;
}

.filter-popover::before {
  position: absolute;
  right: 20px;
  top: -6px;
  width: 10px;
  height: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--color-surface);
  content: "";
  transform: rotate(45deg);
}

.filter-option {
  position: relative;
  display: grid;
  min-height: 48px;
  grid-template-columns: 20px 1fr 18px;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 0 10px;
  color: rgba(209, 197, 183, 0.74);
  cursor: pointer;
  transform: translate3d(0, 0, 0);
  transition: background 160ms ease, transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.filter-option:hover,
.filter-option:focus-within {
  background: rgba(184, 155, 114, 0.08);
}

.filter-option:active {
  transform: translate3d(2px, 0, 0);
}

.filter-option input {
  width: 16px;
  height: 16px;
  accent-color: var(--color-accent);
}

.filter-option svg {
  color: var(--color-accent-bright);
}

.library-popover-enter-active,
.library-popover-leave-active {
  transition: opacity 170ms ease, transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.library-popover-enter-from,
.library-popover-leave-to {
  opacity: 0;
  transform: translate3d(0, -6px, 0) scale(0.985);
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

@media (max-width: 520px) {
  .library-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .library-controls {
    width: 100%;
    justify-content: space-between;
  }

  .sort-control {
    min-width: 0;
    flex: 1;
  }

  .sort-button {
    width: 100%;
  }

  .filter-button span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sort-button,
  .sort-button-icon,
  .sort-button-chevron,
  .sort-option,
  .filter-button,
  .filter-button-icon,
  .filter-option,
  .library-popover-enter-active,
  .library-popover-leave-active {
    transition: none;
  }

  .sort-button:active,
  .sort-option:active,
  .filter-button:active,
  .filter-option:active,
  .sort-button.active .sort-button-icon,
  .filter-button.active .filter-button-icon {
    transform: none;
  }
}
</style>
