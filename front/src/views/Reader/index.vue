<template>
  <div class="reader-view" :class="{ 'fit-width-mode': fitMode === 'width' }" @click="toggleControls">
    <div v-if="loading" class="reader-loading">正在加载页面...</div>

    <template v-else>
      <img
        v-if="currentImage"
        class="reader-image"
        :class="{ 'fit-width': fitMode === 'width' }"
        :src="currentImage.src"
        :alt="currentImage.name"
        :style="{ filter: `brightness(${brightness}%)` }"
        @click.stop="toggleControls"
      />

      <div v-if="controlsVisible" class="reader-top" @click.stop>
        <button class="reader-icon" type="button" aria-label="返回" @click="router.back()">
          <ArrowLeft :size="24" />
        </button>
        <div>
          <span>书库</span>
          <strong>{{ manga?.title || '阅读器' }}</strong>
        </div>
        <button class="reader-icon" type="button" aria-label="收藏" @click="toggleFavorite">
          <Bookmark :size="22" :fill="favorite ? 'currentColor' : 'none'" />
        </button>
      </div>

      <div v-if="controlsVisible" class="reader-bottom" @click.stop>
        <div class="reader-progress-row">
          <button class="reader-page-button" type="button" aria-label="上一页" @click="previousPage">
            <ChevronLeft :size="26" />
          </button>

          <div class="reader-progress">
            <span class="reader-progress-value">{{ currentIndex + 1 }}</span>
            <input
              v-model.number="currentIndex"
              type="range"
              min="0"
              :max="Math.max(0, images.length - 1)"
              step="1"
              aria-label="阅读进度"
            />
            <span class="reader-progress-value total">{{ images.length }}</span>
          </div>

          <button class="reader-page-button" type="button" aria-label="下一页" @click="nextPage">
            <ChevronRight :size="26" />
          </button>
        </div>

        <div v-if="brightnessVisible" class="reader-panel" aria-label="亮度">
          <span>亮度</span>
          <input v-model.number="brightness" type="range" min="60" max="140" step="5" aria-label="亮度" @input="scheduleHide" />
          <strong>{{ brightness }}%</strong>
        </div>

        <div v-if="pageListVisible" class="reader-page-strip" aria-label="页面列表">
          <button
            v-for="(_, index) in images"
            :key="index"
            class="reader-page-chip"
            :class="{ active: index === currentIndex }"
            type="button"
            @click="goToPage(index)"
          >
            {{ index + 1 }}
          </button>
        </div>

        <div v-if="readerSettingsVisible" class="reader-panel setting-panel" aria-label="阅读页设置">
          <span>页面适配</span>
          <button class="setting-chip" :class="{ active: fitMode === 'contain' }" type="button" @click="setFitMode('contain')">适应屏幕</button>
          <button class="setting-chip" :class="{ active: fitMode === 'width' }" type="button" @click="setFitMode('width')">适应宽度</button>
        </div>

        <div class="reader-actions">
          <button class="reader-tool" :class="{ active: brightnessVisible }" type="button" aria-label="亮度" @click="toggleBrightness">
            <Sun :size="24" />
          </button>
          <button class="reader-tool" :class="{ active: favorite }" type="button" aria-label="收藏" @click="toggleFavorite">
            <Bookmark :size="24" :fill="favorite ? 'currentColor' : 'none'" />
          </button>
          <button class="reader-tool" :class="{ active: pageListVisible }" type="button" aria-label="页面列表" @click="togglePageList">
            <PanelTop :size="24" />
          </button>
          <button class="reader-tool" :class="{ active: readerSettingsVisible }" type="button" aria-label="阅读页设置" @click="toggleReaderSettings">
            <Settings :size="24" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { libraryService } from '@/services/libraryService'
import type { ImageAsset, MangaItem } from '@/services/types'
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, PanelTop, Settings, Sun } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const manga = ref<MangaItem | null>(null)
const images = ref<ImageAsset[]>([])
const currentIndex = ref(0)
const controlsVisible = ref(true)
const loading = ref(true)
const favorite = ref(false)
const brightness = ref(100)
const brightnessVisible = ref(false)
const pageListVisible = ref(false)
const readerSettingsVisible = ref(false)
const fitMode = ref<'contain' | 'width'>('contain')
let hideTimer: number | undefined

const mangaId = computed(() => String(route.params.id))
const currentImage = computed(() => images.value[currentIndex.value] ?? null)

onMounted(async () => {
  loading.value = true
  manga.value = await libraryService.getManga(mangaId.value) ?? null
  images.value = await libraryService.getImageAssets(mangaId.value)
  favorite.value = libraryService.getShelfState(mangaId.value).favorite
  const progress = libraryService.getProgress(mangaId.value)
  currentIndex.value = Math.min(progress?.lastIndex ?? 0, Math.max(0, images.value.length - 1))
  loading.value = false
  scheduleHide()
})

onUnmounted(() => {
  window.clearTimeout(hideTimer)
  for (const image of images.value) {
    URL.revokeObjectURL(image.src)
  }
})

watch(currentIndex, (value) => {
  libraryService.saveProgress(mangaId.value, value, images.value.length)
})

function toggleControls() {
  controlsVisible.value = !controlsVisible.value
  if (controlsVisible.value) {
    scheduleHide()
  }
}

function scheduleHide() {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    controlsVisible.value = false
    brightnessVisible.value = false
    pageListVisible.value = false
    readerSettingsVisible.value = false
  }, 3200)
}

function previousPage() {
  currentIndex.value = Math.max(0, currentIndex.value - 1)
  scheduleHide()
}

function nextPage() {
  currentIndex.value = Math.min(images.value.length - 1, currentIndex.value + 1)
  scheduleHide()
}

function toggleFavorite() {
  favorite.value = !favorite.value
  libraryService.setShelfState(mangaId.value, { favorite: favorite.value })
  scheduleHide()
}

function toggleBrightness() {
  brightnessVisible.value = !brightnessVisible.value
  pageListVisible.value = false
  readerSettingsVisible.value = false
  scheduleHide()
}

function togglePageList() {
  pageListVisible.value = !pageListVisible.value
  brightnessVisible.value = false
  readerSettingsVisible.value = false
  scheduleHide()
}

function toggleReaderSettings() {
  readerSettingsVisible.value = !readerSettingsVisible.value
  brightnessVisible.value = false
  pageListVisible.value = false
  scheduleHide()
}

function goToPage(index: number) {
  currentIndex.value = index
  scheduleHide()
}

function setFitMode(mode: 'contain' | 'width') {
  fitMode.value = mode
  scheduleHide()
}
</script>

<style scoped>
.reader-view {
  position: relative;
  display: flex;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #000;
}

.reader-view.fit-width-mode {
  align-items: flex-start;
  overflow-y: auto;
}

.reader-loading {
  color: rgba(229, 226, 225, 0.7);
}

.reader-image {
  max-width: 100%;
  max-height: 100dvh;
  object-fit: contain;
}

.reader-image.fit-width {
  width: 100%;
  height: auto;
  max-height: none;
}

.reader-top {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  height: var(--top-bar-height);
  align-items: center;
  justify-content: space-between;
  padding: var(--safe-top) 20px 0;
  background: linear-gradient(to bottom, rgba(15, 15, 15, 0.9), rgba(15, 15, 15, 0));
}

.reader-top span {
  display: block;
  color: var(--color-accent);
  font-size: 12px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.reader-top strong {
  display: block;
  max-width: 210px;
  overflow: hidden;
  color: rgba(229, 226, 225, 0.7);
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-icon,
.reader-tool,
.reader-page-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: var(--color-accent);
  background: rgba(30, 30, 30, 0.76);
  cursor: pointer;
}

.reader-icon,
.reader-tool {
  width: 48px;
  height: 48px;
}

.reader-bottom {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 20;
  padding: 34px 18px calc(14px + var(--safe-bottom));
  background: linear-gradient(to top, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0));
}

.reader-progress-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 56px;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
}

.reader-page-button {
  width: 56px;
  height: 56px;
  color: var(--color-accent-bright);
  background: rgba(30, 30, 30, 0.86);
}

.reader-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(48px, 1fr));
  gap: 18px;
  justify-items: center;
}

.reader-tool {
  color: rgba(209, 197, 183, 0.66);
  background: transparent;
}

.reader-tool.active {
  color: var(--color-accent);
}

.reader-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin: -8px 0 18px;
  padding: 12px 14px;
  border: 1px solid rgba(153, 143, 131, 0.18);
  border-radius: 16px;
  color: rgba(209, 197, 183, 0.72);
  background: rgba(18, 18, 18, 0.78);
  font-size: 13px;
}

.reader-panel input {
  width: 100%;
  accent-color: var(--color-accent);
}

.reader-panel strong {
  color: var(--color-accent-bright);
  font-weight: 400;
}

.setting-panel {
  grid-template-columns: 1fr auto auto;
}

.setting-chip {
  min-height: 34px;
  border: 1px solid rgba(153, 143, 131, 0.28);
  border-radius: 999px;
  padding: 0 12px;
  color: rgba(209, 197, 183, 0.66);
  background: transparent;
  font-size: 12px;
}

.setting-chip.active {
  border-color: rgba(225, 194, 150, 0.7);
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.16);
}

.reader-page-strip {
  display: flex;
  gap: 8px;
  margin: -8px 0 18px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: none;
}

.reader-page-strip::-webkit-scrollbar {
  display: none;
}

.reader-page-chip {
  flex: 0 0 auto;
  min-width: 42px;
  height: 34px;
  border: 1px solid rgba(153, 143, 131, 0.28);
  border-radius: 999px;
  color: rgba(209, 197, 183, 0.66);
  background: rgba(30, 30, 30, 0.68);
  font-size: 13px;
}

.reader-page-chip.active {
  border-color: rgba(225, 194, 150, 0.7);
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.16);
}

.reader-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(209, 197, 183, 0.62);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.reader-progress-value {
  flex: 0 0 auto;
  min-width: 28px;
}

.reader-progress-value.total {
  text-align: right;
}

.reader-progress input {
  min-width: 0;
  flex: 1 1 auto;
  accent-color: var(--color-accent);
}
</style>
