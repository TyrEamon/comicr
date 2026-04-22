<template>
  <div class="reader-view" :class="{ 'continuous-mode': isContinuousMode }" @click="toggleControls">
    <div v-if="loading" class="reader-loading">正在加载页面...</div>
    <div v-else-if="loadError" class="reader-loading">
      <div class="reader-error">
        <strong>加载失败</strong>
        <p>{{ loadError }}</p>
        <button class="ghost-button" type="button" @click.stop="router.back()">返回</button>
      </div>
    </div>

    <template v-else>
      <div
        v-if="readerMode === 'gallery'"
        class="reader-stage gallery-stage"
        @click.stop="handleGalleryTap"
        @touchstart.passive="handleGalleryTouchStart"
        @touchend.passive="handleGalleryTouchEnd"
      >
        <img
          v-if="currentImage?.src"
          class="reader-image"
          :class="{ 'fit-width': fitMode === 'width' }"
          :src="currentImage.src"
          :alt="currentImage.name"
          :style="imageStyle"
          @click.stop="handleGalleryTap"
        />
        <div v-else class="reader-image-placeholder" @click.stop="handleGalleryTap">正在加载当前页...</div>
      </div>

      <div
        v-else
        ref="continuousContainer"
        class="reader-stage continuous-stage"
        @click.stop="toggleControls"
        @scroll.passive="handleContinuousScroll"
      >
        <div
          v-for="(image, index) in images"
          :key="image.id"
          :ref="(element) => setContinuousFrameRef(element, index)"
          class="continuous-frame"
          :class="{ 'fit-width-frame': fitMode === 'width' }"
        >
          <img
            v-if="image.src"
            class="reader-image continuous-image"
            :class="{ 'fit-width': fitMode === 'width' }"
            :src="image.src"
            :alt="image.name"
            :style="imageStyle"
            @click.stop="toggleControls"
          />
          <div v-else class="reader-image-placeholder continuous-placeholder">正在加载第 {{ index + 1 }} 页...</div>
        </div>
      </div>

      <div v-if="controlsVisible" class="reader-top" @click.stop>
        <button class="reader-icon" type="button" aria-label="返回" @click="router.back()">
          <ArrowLeft :size="24" />
        </button>
        <div>
          <span>{{ isCloudReader ? '云盘' : '书库' }}</span>
          <strong>{{ manga?.title || '阅读器' }}</strong>
        </div>
        <button class="reader-icon" type="button" aria-label="收藏" @click="toggleFavorite">
          <Bookmark :size="22" :fill="favorite ? 'currentColor' : 'none'" />
        </button>
      </div>

      <div v-if="controlsVisible" class="reader-bottom" @click.stop>
        <div class="reader-progress-row">
          <button class="reader-page-button" type="button" aria-label="回到开头" @click="jumpToStart">
            <ChevronsLeft :size="24" />
          </button>

          <div class="reader-progress">
            <span class="reader-progress-value">{{ currentIndex + 1 }}</span>
            <input
              :value="currentIndex"
              type="range"
              min="0"
              :max="lastImageIndex"
              step="1"
              aria-label="阅读进度"
              @input="handleProgressInput"
            />
            <span class="reader-progress-value total">{{ images.length }}</span>
          </div>

          <button class="reader-page-button" type="button" aria-label="跳到末尾" @click="jumpToEnd">
            <ChevronsRight :size="24" />
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
          <button class="reader-tool" :class="{ active: readerSettingsVisible }" type="button" aria-label="阅读设置" @click="toggleReaderSettings">
            <Settings :size="24" />
          </button>
        </div>
      </div>

      <div v-if="readerSettingsVisible" class="reader-settings-backdrop" @click.stop="closeReaderSettings">
        <aside class="reader-settings-drawer" aria-label="阅读设置" @click.stop>
          <div class="reader-settings-header">
            <div>
              <p class="drawer-label">阅读中</p>
              <h2>阅读设置</h2>
            </div>
            <button class="reader-icon reader-drawer-close" type="button" aria-label="关闭阅读设置" @click="closeReaderSettings">
              <X :size="20" />
            </button>
          </div>

          <section class="reader-settings-section">
            <p class="drawer-section-label">阅读模式</p>
            <button class="reader-mode-option" :class="{ active: readerMode === 'gallery' }" type="button" @click="setReaderMode('gallery')">
              <strong>画廊</strong>
              <span>左右滑动切换图片</span>
            </button>
            <button class="reader-mode-option" :class="{ active: readerMode === 'continuous' }" type="button" @click="setReaderMode('continuous')">
              <strong>连续</strong>
              <span>从上到下连续阅读</span>
            </button>
          </section>

          <section class="reader-settings-section">
            <p class="drawer-section-label">页面适配</p>
            <div class="reader-settings-segment">
              <button class="setting-chip drawer-chip" :class="{ active: fitMode === 'contain' }" type="button" @click="setFitMode('contain')">适应屏幕</button>
              <button class="setting-chip drawer-chip" :class="{ active: fitMode === 'width' }" type="button" @click="setFitMode('width')">适应宽度</button>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { cloudService } from '@/services/cloudService'
import { libraryService } from '@/services/libraryService'
import { readerService, type ReaderFitMode, type ReaderMode } from '@/services/readerService'
import type { ImageAsset, MangaItem } from '@/services/types'
import { ArrowLeft, Bookmark, ChevronsLeft, ChevronsRight, PanelTop, Settings, Sun, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const preferences = readerService.getPreferences()

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
const readerMode = ref<ReaderMode>(preferences.mode)
const fitMode = ref<ReaderFitMode>(preferences.fitMode)
const continuousContainer = ref<HTMLElement | null>(null)
const continuousFrames = ref<HTMLElement[]>([])
const loadError = ref('')
const touchStartX = ref(0)
const touchStartY = ref(0)
const ignoreNextTap = ref(false)

let hideTimer: number | undefined
let scrollSyncFrame: number | undefined

const mangaId = computed(() => String(route.params.id))
const isCloudReader = computed(() => cloudService.isWebDavReaderId(mangaId.value))
const currentImage = computed(() => images.value[currentIndex.value] ?? null)
const isContinuousMode = computed(() => readerMode.value === 'continuous')
const lastImageIndex = computed(() => Math.max(0, images.value.length - 1))
const imageStyle = computed(() => ({ filter: `brightness(${brightness.value}%)` }))

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  continuousFrames.value = []
  try {
    if (isCloudReader.value) {
      const remoteManga = await cloudService.getWebDavReaderAssets(mangaId.value)
      manga.value = {
        id: remoteManga.id,
        title: remoteManga.title,
        localPath: remoteManga.id,
        imageCount: remoteManga.imageCount,
        source: 'cloud',
        addedAt: Date.now(),
        updatedAt: Date.now(),
      }
      images.value = remoteManga.images
    } else {
      manga.value = await libraryService.getManga(mangaId.value) ?? null
      images.value = await libraryService.getImageAssets(mangaId.value)
    }

    if (!manga.value || images.value.length === 0) {
      throw new Error('没有找到可阅读的图片')
    }

    favorite.value = libraryService.getShelfState(mangaId.value).favorite
    const progress = libraryService.getProgress(mangaId.value)
    currentIndex.value = Math.min(progress?.lastIndex ?? 0, lastImageIndex.value)
    await ensureImagesAround(currentIndex.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '阅读器加载失败'
  } finally {
    loading.value = false
  }

  if (loadError.value) return

  if (isContinuousMode.value) {
    await scrollToCurrentIndex('auto')
  }

  scheduleHide()
})

onUnmounted(() => {
  window.clearTimeout(hideTimer)
  if (scrollSyncFrame) {
    window.cancelAnimationFrame(scrollSyncFrame)
  }

  for (const image of images.value) {
    if (image.src.startsWith('blob:')) {
      URL.revokeObjectURL(image.src)
    }
  }
})

watch(currentIndex, (value) => {
  libraryService.saveProgress(mangaId.value, value, images.value.length)
  void ensureImagesAround(value).then(() => pruneLoadedLocalImages(value))
})

watch(readerMode, async (mode) => {
  readerService.updatePreferences({ mode })
  if (mode === 'continuous') {
    await scrollToCurrentIndex('auto')
  }
})

watch(fitMode, async (mode) => {
  readerService.updatePreferences({ fitMode: mode })
  if (isContinuousMode.value) {
    await scrollToCurrentIndex('auto')
  }
})

function toggleControls() {
  if (ignoreNextTap.value) {
    ignoreNextTap.value = false
    return
  }

  if (readerSettingsVisible.value) return

  controlsVisible.value = !controlsVisible.value
  if (controlsVisible.value) {
    scheduleHide()
  } else {
    window.clearTimeout(hideTimer)
    brightnessVisible.value = false
    pageListVisible.value = false
  }
}

function scheduleHide() {
  window.clearTimeout(hideTimer)
  if (readerSettingsVisible.value) return

  hideTimer = window.setTimeout(() => {
    controlsVisible.value = false
    brightnessVisible.value = false
    pageListVisible.value = false
  }, 3200)
}

function previousPage() {
  goToPage(currentIndex.value - 1)
}

function nextPage() {
  goToPage(currentIndex.value + 1)
}

function jumpToStart() {
  goToPage(0)
}

function jumpToEnd() {
  goToPage(lastImageIndex.value)
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
  controlsVisible.value = true
  scheduleHide()
}

function togglePageList() {
  pageListVisible.value = !pageListVisible.value
  brightnessVisible.value = false
  readerSettingsVisible.value = false
  controlsVisible.value = true
  scheduleHide()
}

function toggleReaderSettings() {
  readerSettingsVisible.value = !readerSettingsVisible.value
  brightnessVisible.value = false
  pageListVisible.value = false
  controlsVisible.value = true
  window.clearTimeout(hideTimer)

  if (!readerSettingsVisible.value) {
    scheduleHide()
  }
}

function closeReaderSettings() {
  readerSettingsVisible.value = false
  scheduleHide()
}

function goToPage(index: number) {
  const nextIndex = Math.min(lastImageIndex.value, Math.max(0, index))
  currentIndex.value = nextIndex

  if (isContinuousMode.value) {
    void scrollToCurrentIndex('smooth')
  }

  scheduleHide()
}

async function ensureImagesAround(index: number) {
  const offsets = isContinuousMode.value
    ? [-2, -1, 0, 1, 2, 3, 4]
    : [-1, 0, 1]

  await Promise.all(offsets.map((offset) => ensureImageLoaded(index + offset)))
}

function pruneLoadedLocalImages(index: number) {
  if (isCloudReader.value) return

  const keepDistance = isContinuousMode.value ? 6 : 3
  images.value = images.value.map((image, imageIndex) => {
    if (Math.abs(imageIndex - index) <= keepDistance) return image
    if (!image.src.startsWith('blob:')) return image
    if (!image.uri && !image.archiveUri) return image

    URL.revokeObjectURL(image.src)
    return {
      ...image,
      src: '',
    }
  })
}

async function ensureImageLoaded(index: number) {
  const image = images.value[index]
  if (!image || image.src) return

  const src = isCloudReader.value
    ? await cloudService.loadWebDavImageAssetSrc(cloudService.pathFromReaderId(mangaId.value), image)
    : await libraryService.loadImageAssetSrc(image)
  if (!src) return

  images.value[index] = {
    ...image,
    src,
  }
}

function handleProgressInput(event: Event) {
  const nextIndex = Number((event.target as HTMLInputElement).value)
  goToPage(nextIndex)
}

function handleGalleryTap(event: MouseEvent) {
  if (ignoreNextTap.value) {
    ignoreNextTap.value = false
    return
  }

  const width = window.innerWidth || (event.currentTarget as HTMLElement).clientWidth
  if (event.clientX < width * 0.35) {
    previousPage()
    return
  }

  if (event.clientX > width * 0.65) {
    nextPage()
    return
  }

  toggleControls()
}

function setReaderMode(mode: ReaderMode) {
  readerMode.value = mode
  controlsVisible.value = true
  window.clearTimeout(hideTimer)
}

function setFitMode(mode: ReaderFitMode) {
  fitMode.value = mode
  controlsVisible.value = true
  window.clearTimeout(hideTimer)
}

function handleGalleryTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
}

function handleGalleryTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return

  const deltaX = touch.clientX - touchStartX.value
  const deltaY = touch.clientY - touchStartY.value

  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return

  ignoreNextTap.value = true
  if (deltaX < 0) {
    nextPage()
  } else {
    previousPage()
  }
}

function setContinuousFrameRef(element: Element | ComponentPublicInstance | null, index: number) {
  if (!element) return
  continuousFrames.value[index] = element as HTMLElement
}

async function scrollToCurrentIndex(behavior: ScrollBehavior) {
  await nextTick()
  const container = continuousContainer.value
  const frame = continuousFrames.value[currentIndex.value]
  if (!container || !frame) return

  container.scrollTo({
    top: frame.offsetTop,
    behavior,
  })
}

function handleContinuousScroll() {
  if (scrollSyncFrame) {
    window.cancelAnimationFrame(scrollSyncFrame)
  }

  scrollSyncFrame = window.requestAnimationFrame(() => {
    const container = continuousContainer.value
    if (!container || continuousFrames.value.length === 0) return

    const anchor = container.scrollTop + container.clientHeight * 0.28
    let closestIndex = currentIndex.value
    let closestDistance = Number.POSITIVE_INFINITY

    continuousFrames.value.forEach((frame, index) => {
      if (!frame) return
      const distance = Math.abs(frame.offsetTop - anchor)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    currentIndex.value = closestIndex
  })
}
</script>

<style scoped>
.reader-view {
  position: relative;
  min-height: 100dvh;
  overflow: hidden;
  background: #000;
}

.reader-loading {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  color: rgba(229, 226, 225, 0.7);
}

.reader-error {
  display: grid;
  width: min(82vw, 320px);
  gap: 14px;
  justify-items: center;
  text-align: center;
}

.reader-error strong {
  color: var(--color-text);
  font-size: 22px;
  font-weight: 400;
}

.reader-error p {
  margin: 0;
  color: rgba(229, 226, 225, 0.62);
  line-height: 1.7;
}

.reader-stage {
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
}

.gallery-stage {
  display: flex;
  align-items: center;
  justify-content: center;
}

.continuous-stage {
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  padding: 0 0 var(--safe-bottom);
  scrollbar-width: none;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.continuous-stage::-webkit-scrollbar {
  display: none;
}

.continuous-frame {
  display: block;
  min-height: 0;
  padding: 0;
  line-height: 0;
}

.continuous-frame.fit-width-frame {
  min-height: auto;
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

.continuous-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: none;
}

.reader-image-placeholder {
  display: grid;
  min-width: min(72vw, 320px);
  min-height: 220px;
  place-items: center;
  border: 1px solid rgba(153, 143, 131, 0.14);
  border-radius: 12px;
  color: rgba(229, 226, 225, 0.52);
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  line-height: 1.6;
}

.continuous-placeholder {
  width: 100%;
  min-height: 100dvh;
  border: 0;
  border-radius: 0;
  background: #050505;
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

.setting-chip {
  min-height: 42px;
  border: 1px solid rgba(153, 143, 131, 0.28);
  border-radius: 999px;
  padding: 0 14px;
  color: rgba(209, 197, 183, 0.66);
  background: transparent;
  font-size: 13px;
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

.reader-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.24);
}

.reader-settings-drawer {
  width: min(86vw, 320px);
  height: 100dvh;
  overflow-y: auto;
  border-left: 1px solid rgba(153, 143, 131, 0.2);
  padding: calc(var(--safe-top) + 18px) 18px calc(var(--safe-bottom) + 24px);
  background: rgba(22, 19, 19, 0.98);
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.42);
  scrollbar-width: none;
}

.reader-settings-drawer::-webkit-scrollbar {
  display: none;
}

.reader-settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 26px;
}

.reader-settings-header h2 {
  margin: 6px 0 0;
  color: var(--color-text);
  font-size: 28px;
  font-weight: 400;
}

.drawer-label,
.drawer-section-label {
  margin: 0;
  color: var(--color-accent);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.reader-drawer-close {
  flex: 0 0 auto;
}

.reader-settings-section {
  margin-top: 22px;
  padding-top: 22px;
  border-top: 1px solid rgba(153, 143, 131, 0.16);
}

.reader-settings-section:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.reader-mode-option {
  display: grid;
  gap: 6px;
  width: 100%;
  margin-top: 12px;
  border: 1px solid rgba(153, 143, 131, 0.2);
  border-radius: 18px;
  padding: 16px;
  color: var(--color-text);
  background: rgba(34, 30, 30, 0.72);
  text-align: left;
}

.reader-mode-option:first-of-type {
  margin-top: 14px;
}

.reader-mode-option strong {
  font-size: 20px;
  font-weight: 400;
}

.reader-mode-option span {
  color: rgba(209, 197, 183, 0.68);
  font-size: 13px;
  line-height: 1.7;
}

.reader-mode-option.active {
  border-color: rgba(225, 194, 150, 0.58);
  background: rgba(184, 155, 114, 0.12);
}

.reader-settings-segment {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.drawer-chip {
  width: 100%;
}
</style>
