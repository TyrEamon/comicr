<template>
  <div class="reader-view" :class="{ 'continuous-mode': isContinuousMode }" @click="toggleControls()">
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
        :class="{ 'text-stage': currentImage?.kind === 'text', 'page-turning': galleryPageTransitionEnabled }"
        @click.stop="handleGalleryTap"
        @touchstart.passive="handleGalleryTouchStart"
        @touchend.passive="handleGalleryTouchEnd"
      >
        <Transition :name="galleryTransitionName" :css="galleryPageTransitionEnabled">
          <div
            :key="currentImage?.id || currentIndex"
            class="gallery-page-frame"
            :class="{ 'text-page-frame': currentImage?.kind === 'text' }"
          >
            <article
              v-if="currentImage?.kind === 'text'"
              class="reader-text-page gallery-text-page"
              :class="{ 'rounded-media': shouldRoundReaderMedia }"
              :style="textPageStyle"
              @click.stop="handleGalleryTap"
            >
              <div ref="galleryTextViewport" class="gallery-text-viewport">
                <div
                  ref="galleryTextFlow"
                  class="reader-text-flow"
                  :style="galleryTextFlowStyle"
                  v-html="currentImage.html"
                />
              </div>
            </article>
            <img
              v-else-if="currentImage?.src"
              class="reader-image"
              :class="{ 'fit-width': fitMode === 'width', rounded: shouldRoundReaderMedia }"
              :src="currentImage.src"
              :alt="currentImage.name"
              :style="imageStyle"
              @click.stop="handleGalleryTap"
              @error="handleImageError(currentIndex)"
            />
            <div v-else class="reader-image-placeholder" @click.stop="handleGalleryTap">正在加载当前页...</div>
          </div>
        </Transition>
      </div>

      <div
        v-else
        ref="continuousContainer"
        class="reader-stage continuous-stage"
        @click.stop="toggleControls()"
        @scroll.passive="handleContinuousScroll"
      >
        <div
          v-for="(image, index) in images"
          :key="image.id"
          :ref="(element) => setContinuousFrameRef(element, index)"
          class="continuous-frame"
          :class="{ 'fit-width-frame': fitMode === 'width' }"
        >
          <article
            v-if="image.kind === 'text'"
            class="reader-text-page continuous-text-page"
            :class="{ 'rounded-media': shouldRoundReaderMedia }"
            :style="textPageStyle"
            @click.stop="toggleControls()"
            v-html="image.html"
          />
          <img
            v-else-if="image.src"
            class="reader-image continuous-image"
            :class="{ 'fit-width': fitMode === 'width', rounded: shouldRoundReaderMedia }"
            :src="image.src"
            :alt="image.name"
            :style="imageStyle"
            @click.stop="toggleControls()"
            @error="handleImageError(index)"
          />
          <div v-else class="reader-image-placeholder continuous-placeholder">正在加载第 {{ index + 1 }} 页...</div>
        </div>
      </div>

      <div v-if="readerMode === 'gallery' && !controlsVisible" class="reader-page-status" aria-hidden="true">
        <div class="reader-device-status">
          <span>{{ readerClockLabel }}</span>
          <span v-if="readerBatteryLevel !== null" class="reader-battery" :class="{ charging: readerBatteryCharging }">
            <span class="reader-battery-icon" :style="readerBatteryStyle"><i /></span>
            <span>{{ readerBatteryLevel }}%</span>
          </span>
        </div>
        <div class="reader-chapter-status">
          <span v-if="readerChapterStatusTitle" class="reader-status-chapter">{{ readerChapterStatusTitle }}</span>
          <span class="reader-status-page">{{ readerChapterPageLabel }}</span>
        </div>
      </div>

      <Transition name="reader-top-slide">
        <div v-if="controlsVisible" class="reader-top" @click.stop>
          <button class="reader-icon" type="button" aria-label="返回" @click="router.back()">
            <ArrowLeft :size="24" />
          </button>
          <div class="reader-title-stack">
            <span>{{ topContextLabel }}</span>
            <strong>{{ manga?.title || '阅读器' }}</strong>
            <small v-if="currentChapter">{{ currentChapter.title }}</small>
          </div>
          <button class="reader-icon" type="button" aria-label="收藏" @click="toggleFavorite">
            <Bookmark :size="22" :fill="favorite ? 'currentColor' : 'none'" />
          </button>
        </div>
      </Transition>

      <Transition name="reader-bottom-slide">
        <div v-if="controlsVisible" class="reader-bottom" @click.stop>
          <div class="reader-progress-row">
            <button class="reader-page-button" type="button" aria-label="回到开头" @click="jumpToStart">
              <ChevronsLeft :size="24" />
            </button>

            <div class="reader-progress">
              <span class="reader-progress-value">{{ readerProgressCurrentLabel }}</span>
              <input
                :value="readerProgressValue"
                type="range"
                min="0"
                :max="readerProgressMax"
                step="1"
                aria-label="阅读进度"
                @input="handleProgressInput"
              />
              <span class="reader-progress-value total">{{ readerProgressTotalLabel }}</span>
            </div>

            <button class="reader-page-button" type="button" aria-label="跳到末尾" @click="jumpToEnd">
              <ChevronsRight :size="24" />
            </button>
          </div>

          <Transition name="reader-panel-pop">
            <div v-if="brightnessVisible" class="reader-panel" aria-label="亮度">
              <span>亮度</span>
              <input v-model.number="brightness" type="range" min="60" max="140" step="5" aria-label="亮度" @input="scheduleHide" />
              <strong>{{ brightness }}%</strong>
            </div>
          </Transition>

          <Transition name="reader-panel-pop">
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
          </Transition>

          <Transition name="reader-panel-pop">
            <div v-if="downloadMessage" class="reader-download-status">{{ downloadMessage }}</div>
          </Transition>

          <div class="reader-actions" :class="{ 'has-cloud-download': isCloudReader }">
            <button class="reader-tool" :class="{ active: brightnessVisible }" type="button" aria-label="亮度" @click="toggleBrightness">
              <Sun :size="24" />
            </button>
            <button class="reader-tool" :class="{ active: favorite }" type="button" aria-label="收藏" @click="toggleFavorite">
              <Bookmark :size="24" :fill="favorite ? 'currentColor' : 'none'" />
            </button>
            <button class="reader-tool" :class="{ active: navigationPanelVisible }" type="button" :aria-label="navigationPanelLabel" @click="toggleNavigationPanel">
              <ListTree v-if="hasChapterList" :size="24" />
              <PanelTop v-else :size="24" />
            </button>
            <button class="reader-tool" type="button" aria-label="重新加载当前页" @click="reloadCurrentPage">
              <RefreshCw :size="23" />
            </button>
            <button
              v-if="isCloudReader"
              class="reader-tool"
              type="button"
              :aria-label="cloudDownloadButtonLabel"
              :disabled="downloadBusy || cloudDownloaded || cloudDownloadQueued"
              @click="downloadCurrentCloudManga"
            >
              <Check v-if="cloudDownloaded" :size="23" />
              <DownloadIcon v-else :size="23" />
            </button>
            <button class="reader-tool" :class="{ active: readerSettingsVisible }" type="button" aria-label="阅读设置" @click="toggleReaderSettings">
              <Settings :size="24" />
            </button>
          </div>
        </div>
      </Transition>

      <article
        v-if="readerMode === 'gallery' && hasTextPages"
        ref="galleryTextMeasureRoot"
        class="reader-text-page gallery-text-page reader-text-measure-root"
        :class="{ 'rounded-media': shouldRoundReaderMedia }"
        :style="textPageStyle"
        aria-hidden="true"
      />

      <Transition name="reader-sheet">
        <div v-if="chapterSheetVisible" class="reader-sheet-backdrop" @click.stop="closeChapterSheet()">
          <section
            class="reader-chapter-sheet"
            :style="chapterSheetStyle"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chapter-sheet-title"
            @click.stop
            @touchstart.passive="handleChapterSheetTouchStart"
            @touchmove.passive="handleChapterSheetTouchMove"
            @touchend.passive="handleChapterSheetTouchEnd"
          >
            <button class="reader-sheet-handle" type="button" aria-label="关闭章节目录" @click="closeChapterSheet()">
              <span />
            </button>
            <header class="reader-chapter-sheet-header">
              <div>
                <p class="drawer-label">目录</p>
                <h2 id="chapter-sheet-title">章节</h2>
              </div>
              <button class="reader-icon reader-drawer-close" type="button" aria-label="关闭章节目录" @click="closeChapterSheet()">
                <X :size="20" />
              </button>
            </header>

            <div class="reader-chapter-sheet-list">
              <button
                v-for="chapter in readerChapters"
                :key="chapter.id"
                class="reader-chapter-item"
                :class="{ active: chapter.id === currentChapter?.id }"
                type="button"
                @click="goToChapter(chapter)"
              >
                <span>{{ chapter.index + 1 }}</span>
                <strong>{{ chapter.title }}</strong>
                <em>第 {{ chapter.pageIndex + 1 }} 页</em>
              </button>
            </div>
          </section>
        </div>
      </Transition>

      <Transition name="reader-drawer">
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
              <button class="reader-mode-option" :class="{ active: readerMode === 'gallery' && galleryDirection === 'right-next' }" type="button" @click="setGalleryMode('right-next')">
                <strong>翻页（从右到左）</strong>
                <span>右侧下一张，左滑下一张</span>
              </button>
              <button class="reader-mode-option" :class="{ active: readerMode === 'gallery' && galleryDirection === 'left-next' }" type="button" @click="setGalleryMode('left-next')">
                <strong>翻页（从左到右）</strong>
                <span>左侧下一张，右滑下一张</span>
              </button>
              <button class="reader-mode-option" :class="{ active: readerMode === 'continuous' }" type="button" @click="setReaderMode('continuous')">
                <strong>连续</strong>
                <span>从上到下连续阅读</span>
              </button>
            </section>

            <section class="reader-settings-section">
              <p class="drawer-section-label">翻页</p>
              <button class="reader-toggle-option" type="button" :class="{ active: pageTurnAnimation }" @click="togglePageTurnAnimation">
                <div>
                  <strong>翻页动画</strong>
                  <span>翻页模式左右滑入滑出，连续模式不受影响</span>
                </div>
                <span class="reader-switch" :class="{ active: pageTurnAnimation }" aria-hidden="true">
                  <i />
                </span>
              </button>
            </section>

            <section v-if="hasTextPages" class="reader-settings-section">
              <p class="drawer-section-label">小说排版</p>
              <label class="reader-range-setting">
                <span>
                  <strong>字号</strong>
                  <em>{{ textFontSize }}px</em>
                </span>
                <input
                  v-model.number="textFontSize"
                  type="range"
                  :min="readerTextPreferenceLimits.fontSize.min"
                  :max="readerTextPreferenceLimits.fontSize.max"
                  :step="readerTextPreferenceLimits.fontSize.step"
                  aria-label="小说字号"
                />
              </label>
              <label class="reader-range-setting">
                <span>
                  <strong>行距</strong>
                  <em>{{ textLineHeight.toFixed(2) }}</em>
                </span>
                <input
                  v-model.number="textLineHeight"
                  type="range"
                  :min="readerTextPreferenceLimits.lineHeight.min"
                  :max="readerTextPreferenceLimits.lineHeight.max"
                  :step="readerTextPreferenceLimits.lineHeight.step"
                  aria-label="小说行距"
                />
              </label>
              <label class="reader-range-setting">
                <span>
                  <strong>首行缩进</strong>
                  <em>{{ textIndentEm.toFixed(1) }}em</em>
                </span>
                <input
                  v-model.number="textIndentEm"
                  type="range"
                  :min="readerTextPreferenceLimits.indentEm.min"
                  :max="readerTextPreferenceLimits.indentEm.max"
                  :step="readerTextPreferenceLimits.indentEm.step"
                  aria-label="小说首行缩进"
                />
              </label>
              <label class="reader-range-setting">
                <span>
                  <strong>段距</strong>
                  <em>{{ textParagraphSpacingEm.toFixed(1) }}em</em>
                </span>
                <input
                  v-model.number="textParagraphSpacingEm"
                  type="range"
                  :min="readerTextPreferenceLimits.paragraphSpacingEm.min"
                  :max="readerTextPreferenceLimits.paragraphSpacingEm.max"
                  :step="readerTextPreferenceLimits.paragraphSpacingEm.step"
                  aria-label="小说段距"
                />
              </label>
            </section>

            <section class="reader-settings-section">
              <p class="drawer-section-label">页面适配</p>
              <div class="reader-settings-segment">
                <button class="setting-chip drawer-chip" :class="{ active: fitMode === 'contain' }" type="button" @click="setFitMode('contain')">适应屏幕</button>
                <button class="setting-chip drawer-chip" :class="{ active: fitMode === 'width' }" type="button" @click="setFitMode('width')">适应宽度</button>
              </div>
              <button v-if="isNovelReader" class="reader-toggle-option" type="button" :class="{ active: imageRoundedCorners }" @click="toggleImageRoundedCorners">
                <div>
                  <strong>图片圆角</strong>
                  <span>给图片页额外加柔和圆角，关闭后按原图边缘显示</span>
                </div>
                <span class="reader-switch" :class="{ active: imageRoundedCorners }" aria-hidden="true">
                  <i />
                </span>
              </button>
            </section>
          </aside>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { cloudService } from '@/services/cloudService'
import { cloudDownloadService } from '@/services/cloudDownloadService'
import { downloadService } from '@/services/downloadService'
import { libraryService } from '@/services/libraryService'
import { readerService, readerTextPreferenceLimits, type ReaderFitMode, type ReaderGalleryDirection, type ReaderMode } from '@/services/readerService'
import { readerSystemUiService } from '@/services/readerSystemUiService'
import type { ImageAsset, MangaItem, ReaderChapter } from '@/services/types'
import { ArrowLeft, Bookmark, Check, ChevronsLeft, ChevronsRight, Download as DownloadIcon, ListTree, PanelTop, RefreshCw, Settings, Sun, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const preferences = readerService.getPreferences()
type PageTurnDirection = 'next' | 'previous'
type GalleryTextPageTarget = 'start' | 'end' | 'keep' | number
interface PageNavigationOptions {
  animate?: boolean
  behavior?: ScrollBehavior
  textPage?: Exclude<GalleryTextPageTarget, 'keep'>
}
interface ChapterSheetCloseOptions {
  syncHistory?: boolean
  scheduleControls?: boolean
}

const manga = ref<MangaItem | null>(null)
const images = ref<ImageAsset[]>([])
const currentIndex = ref(0)
const controlsVisible = ref(true)
const loading = ref(true)
const favorite = ref(false)
const brightness = ref(100)
const brightnessVisible = ref(false)
const pageListVisible = ref(false)
const chapterSheetVisible = ref(false)
const readerSettingsVisible = ref(false)
const downloadBusy = ref(false)
const downloadMessage = ref('')
const cloudDownloaded = ref(false)
const cloudDownloadQueued = ref(false)
const readerMode = ref<ReaderMode>(preferences.mode)
const fitMode = ref<ReaderFitMode>(preferences.fitMode)
const galleryDirection = ref<ReaderGalleryDirection>(preferences.galleryDirection)
const pageTurnAnimation = ref(preferences.pageTurnAnimation)
const imageRoundedCorners = ref(preferences.imageRoundedCorners)
const textFontSize = ref(preferences.textFontSize)
const textLineHeight = ref(preferences.textLineHeight)
const textIndentEm = ref(preferences.textIndentEm)
const textParagraphSpacingEm = ref(preferences.textParagraphSpacingEm)
const pageTurnDirection = ref<PageTurnDirection>('next')
const reducedMotion = ref(false)
const continuousContainer = ref<HTMLElement | null>(null)
const continuousFrames = ref<HTMLElement[]>([])
const galleryTextViewport = ref<HTMLElement | null>(null)
const galleryTextFlow = ref<HTMLElement | null>(null)
const galleryTextMeasureRoot = ref<HTMLElement | null>(null)
const galleryTextPageIndex = ref(0)
const galleryTextPageCount = ref(1)
const galleryTextPageWidth = ref(0)
const galleryVirtualPageCounts = ref<number[]>([])
const loadError = ref('')
const touchStartX = ref(0)
const touchStartY = ref(0)
const chapterSheetTouchStartY = ref(0)
const chapterSheetTouchOffset = ref(0)
const chapterSheetDragging = ref(false)
const ignoreNextTap = ref(false)
const readerClockLabel = ref('')
const readerBatteryLevel = ref<number | null>(null)
const readerBatteryCharging = ref(false)

let hideTimer: number | undefined
let readerClockTimer: number | undefined
let readerBatteryTimer: number | undefined
let scrollSyncFrame: number | undefined
let lastTapAt = 0
let reducedMotionQuery: MediaQueryList | undefined
let chapterSheetHistoryActive = false
let galleryTextMeasureFrame: number | undefined
let galleryVirtualMeasureFrame: number | undefined
let pendingGalleryTextPageTarget: Exclude<GalleryTextPageTarget, 'keep'> = 'start'
const GALLERY_TEXT_PAGE_GAP = 36

const mangaId = computed(() => String(route.params.id))
const isCloudReader = computed(() => cloudService.isWebDavReaderId(mangaId.value))
const currentImage = computed(() => images.value[currentIndex.value] ?? null)
const isContinuousMode = computed(() => readerMode.value === 'continuous')
const lastImageIndex = computed(() => Math.max(0, images.value.length - 1))
const hasTextPages = computed(() => images.value.some((image) => image.kind === 'text'))
const isNovelReader = computed(() => hasTextPages.value || manga.value?.source === 'epub' || manga.value?.source === 'txt')
const shouldRoundReaderMedia = computed(() => isNovelReader.value && imageRoundedCorners.value)
const imageStyle = computed(() => ({ filter: `brightness(${brightness.value}%)` }))
const textPageStyle = computed(() => ({
  ...imageStyle.value,
  '--reader-text-font-size': `${textFontSize.value}px`,
  '--reader-text-line-height': String(textLineHeight.value),
  '--reader-text-indent': `${textIndentEm.value}em`,
  '--reader-text-paragraph-spacing': `${textParagraphSpacingEm.value}em`,
}))
const galleryTextFlowStyle = computed(() => ({
  '--reader-text-page-width': `${Math.max(1, galleryTextPageWidth.value)}px`,
  '--reader-text-page-gap': `${GALLERY_TEXT_PAGE_GAP}px`,
  transform: `translate3d(-${galleryTextPageIndex.value * (galleryTextPageWidth.value + GALLERY_TEXT_PAGE_GAP)}px, 0, 0)`,
}))
const isGalleryPagedProgress = computed(() => readerMode.value === 'gallery' && hasTextPages.value)
const galleryNormalizedPageCounts = computed(() => (
  images.value.map((image, index) => {
    if (image.kind !== 'text') return 1
    return Math.max(
      1,
      galleryVirtualPageCounts.value[index]
        ?? (index === currentIndex.value ? galleryTextPageCount.value : 1),
    )
  })
))
const galleryVirtualTotalPages = computed(() => (
  Math.max(1, galleryNormalizedPageCounts.value.reduce((total, count) => total + count, 0))
))
const galleryVirtualCurrentPage = computed(() => {
  const beforeCurrent = galleryNormalizedPageCounts.value
    .slice(0, currentIndex.value)
    .reduce((total, count) => total + count, 0)
  const currentPageCount = galleryNormalizedPageCounts.value[currentIndex.value] ?? 1
  const currentOffset = currentImage.value?.kind === 'text'
    ? Math.min(galleryTextPageIndex.value, currentPageCount - 1)
    : 0
  return Math.min(galleryVirtualTotalPages.value, beforeCurrent + currentOffset + 1)
})
const readerProgressValue = computed(() => (
  isGalleryPagedProgress.value ? galleryVirtualCurrentPage.value - 1 : currentIndex.value
))
const readerProgressMax = computed(() => (
  isGalleryPagedProgress.value ? galleryVirtualTotalPages.value - 1 : lastImageIndex.value
))
const readerProgressCurrentLabel = computed(() => (
  isGalleryPagedProgress.value ? galleryVirtualCurrentPage.value : currentIndex.value + 1
))
const readerProgressTotalLabel = computed(() => (
  isGalleryPagedProgress.value ? galleryVirtualTotalPages.value : images.value.length
))
const galleryPageTransitionEnabled = computed(() => pageTurnAnimation.value && !reducedMotion.value && readerMode.value === 'gallery')
const galleryTransitionName = computed(() => galleryPageTransitionEnabled.value ? `reader-page-slide-${pageTurnDirection.value}` : '')
const chapterSheetStyle = computed(() => (
  chapterSheetTouchOffset.value > 0
    ? { transform: `translate3d(0, ${chapterSheetTouchOffset.value}px, 0)` }
    : {}
))
const readerChapters = computed<ReaderChapter[]>(() => {
  const chapters: ReaderChapter[] = []
  const seen = new Set<string>()

  images.value.forEach((image, index) => {
    const title = image.chapterTitle?.trim() || (image.kind === 'text' ? image.name.trim() : '')
    if (!title) return

    const key = image.chapterHref
      ? `href:${image.chapterHref}`
      : image.chapterIndex !== undefined
        ? `index:${image.chapterIndex}`
        : `page:${index}`
    if (seen.has(key)) return
    seen.add(key)

    chapters.push({
      id: key,
      index: image.chapterIndex ?? chapters.length,
      title,
      pageIndex: index,
      href: image.chapterHref,
    })
  })

  return chapters.sort((left, right) => left.pageIndex - right.pageIndex)
})
const hasChapterList = computed(() => readerChapters.value.length > 0)
const readerChapterPageStatus = computed(() => {
  const imageCount = images.value.length
  if (imageCount === 0) return { current: 0, total: 0 }

  const chapters = readerChapters.value
  const chapter = currentChapter.value
  let startIndex = 0
  let endIndex = imageCount - 1

  if (chapter) {
    startIndex = Math.min(imageCount - 1, Math.max(0, chapter.pageIndex))
    const chapterListIndex = chapters.findIndex((item) => item.id === chapter.id)
    const nextChapter = chapterListIndex >= 0 ? chapters[chapterListIndex + 1] : undefined
    endIndex = Math.max(startIndex, Math.min(imageCount - 1, (nextChapter?.pageIndex ?? imageCount) - 1))
  }

  const pageCountAt = (index: number) => Math.max(1, galleryNormalizedPageCounts.value[index] ?? 1)
  const total = Math.max(
    1,
    galleryNormalizedPageCounts.value
      .slice(startIndex, endIndex + 1)
      .reduce((sum, count) => sum + Math.max(1, count), 0),
  )
  const beforeCurrent = galleryNormalizedPageCounts.value
    .slice(startIndex, currentIndex.value)
    .reduce((sum, count) => sum + Math.max(1, count), 0)
  const currentPageCount = pageCountAt(currentIndex.value)
  const currentOffset = currentImage.value?.kind === 'text'
    ? Math.min(galleryTextPageIndex.value, currentPageCount - 1)
    : 0

  return {
    current: Math.min(total, Math.max(1, beforeCurrent + currentOffset + 1)),
    total,
  }
})
const readerChapterStatusTitle = computed(() => currentChapter.value?.title?.trim() || manga.value?.title || '')
const readerChapterPageLabel = computed(() => `${readerChapterPageStatus.value.current} / ${readerChapterPageStatus.value.total}`)
const readerBatteryStyle = computed(() => ({
  '--reader-battery-fill': `${Math.round(((readerBatteryLevel.value ?? 0) / 100) * 14)}px`,
}))
const currentChapter = computed(() => {
  let matched: ReaderChapter | null = null
  for (const chapter of readerChapters.value) {
    if (chapter.pageIndex > currentIndex.value) break
    matched = chapter
  }
  return matched
})
const navigationPanelLabel = computed(() => hasChapterList.value ? '章节目录' : '页面列表')
const navigationPanelVisible = computed(() => hasChapterList.value ? chapterSheetVisible.value : pageListVisible.value)
const topContextLabel = computed(() => {
  if (currentChapter.value) return `第 ${currentChapter.value.index + 1} 章`
  return isCloudReader.value ? '云盘' : '书库'
})
const cloudDownloadButtonLabel = computed(() => {
  if (cloudDownloaded.value) return '已下载当前漫画'
  if (cloudDownloadQueued.value) return '当前漫画已在下载队列'
  return '下载当前漫画'
})

function formatReaderClock(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

function updateReaderClock() {
  readerClockLabel.value = formatReaderClock()
}

async function updateReaderDeviceStatus() {
  const status = await readerSystemUiService.getDeviceStatus()
  if (typeof status.batteryLevel === 'number' && Number.isFinite(status.batteryLevel)) {
    readerBatteryLevel.value = Math.max(0, Math.min(100, Math.round(status.batteryLevel)))
  }
  readerBatteryCharging.value = Boolean(status.isCharging)
}

function startReaderStatusBar() {
  updateReaderClock()
  void updateReaderDeviceStatus()
  readerClockTimer = window.setInterval(updateReaderClock, 30_000)
  readerBatteryTimer = window.setInterval(() => {
    void updateReaderDeviceStatus()
  }, 60_000)
}

function syncReducedMotion(event?: MediaQueryListEvent) {
  reducedMotion.value = event?.matches ?? Boolean(reducedMotionQuery?.matches)
}

function handleReaderKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (chapterSheetVisible.value) {
    closeChapterSheet()
    return
  }
  if (readerSettingsVisible.value) {
    closeReaderSettings()
  }
}

function handleReaderPopState() {
  if (!chapterSheetVisible.value) return
  chapterSheetHistoryActive = false
  closeChapterSheet({ syncHistory: false })
}

function handleReaderResize() {
  scheduleGalleryTextPagination()
  scheduleGalleryVirtualPagination()
}

onMounted(async () => {
  void readerSystemUiService.enterImmersive()
  startReaderStatusBar()
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncReducedMotion()
  reducedMotionQuery.addEventListener('change', syncReducedMotion)
  window.addEventListener('keydown', handleReaderKeydown)
  window.addEventListener('popstate', handleReaderPopState)
  window.addEventListener('resize', handleReaderResize)

  loading.value = true
  loadError.value = ''
  continuousFrames.value = []
  try {
    if (isCloudReader.value) {
      const path = cloudService.pathFromReaderId(mangaId.value)
      cloudDownloaded.value = cloudDownloadService.isWebDavDownloaded(path)
      cloudDownloadQueued.value = Boolean(downloadService.findActiveWebDavTask(path))
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
    const queryPage = Number(route.query.page)
    currentIndex.value = Math.min(
      Number.isFinite(queryPage) ? Math.max(0, queryPage) : progress?.lastIndex ?? 0,
      lastImageIndex.value,
    )
    await ensureImagesAround(currentIndex.value)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '阅读器加载失败'
  } finally {
    loading.value = false
  }

  if (loadError.value) return

  if (isContinuousMode.value) {
    await scrollToCurrentIndex('auto')
  } else {
    scheduleGalleryTextPagination('start')
    scheduleGalleryVirtualPagination()
  }

  scheduleHide()
})

onUnmounted(() => {
  void readerSystemUiService.exitImmersive()
  window.clearTimeout(hideTimer)
  window.clearInterval(readerClockTimer)
  window.clearInterval(readerBatteryTimer)
  reducedMotionQuery?.removeEventListener('change', syncReducedMotion)
  window.removeEventListener('keydown', handleReaderKeydown)
  window.removeEventListener('popstate', handleReaderPopState)
  window.removeEventListener('resize', handleReaderResize)
  chapterSheetHistoryActive = false
  if (galleryTextMeasureFrame) {
    window.cancelAnimationFrame(galleryTextMeasureFrame)
  }
  if (galleryVirtualMeasureFrame) {
    window.cancelAnimationFrame(galleryVirtualMeasureFrame)
  }
  if (scrollSyncFrame) {
    window.cancelAnimationFrame(scrollSyncFrame)
  }

  if (isCloudReader.value) {
    const mangaPath = cloudService.pathFromReaderId(mangaId.value)
    for (const image of images.value) {
      cloudService.releaseWebDavImageAssetSrc(mangaPath, image)
    }
  } else {
    for (const image of images.value) {
      if (image.kind !== 'text' && image.src.startsWith('blob:')) {
        URL.revokeObjectURL(image.src)
      }
    }
  }
})

watch(currentIndex, (value) => {
  libraryService.saveProgress(mangaId.value, value, images.value.length)
  void ensureImagesAround(value).then(() => pruneLoadedLocalImages(value))
  scheduleGalleryTextPagination(pendingGalleryTextPageTarget)
  pendingGalleryTextPageTarget = 'start'
})

watch(readerMode, async (mode) => {
  readerService.updatePreferences({ mode })
  if (mode === 'continuous') {
    await scrollToCurrentIndex('auto')
  } else {
    scheduleGalleryTextPagination('start')
    scheduleGalleryVirtualPagination()
  }
})

watch(fitMode, async (mode) => {
  readerService.updatePreferences({ fitMode: mode })
  if (isContinuousMode.value) {
    await scrollToCurrentIndex('auto')
  }
})

watch(galleryDirection, (direction) => {
  readerService.updatePreferences({ galleryDirection: direction })
})

watch(pageTurnAnimation, (enabled) => {
  readerService.updatePreferences({ pageTurnAnimation: enabled })
})

watch(imageRoundedCorners, (enabled) => {
  readerService.updatePreferences({ imageRoundedCorners: enabled })
})

watch([textFontSize, textLineHeight, textIndentEm, textParagraphSpacingEm], ([fontSize, lineHeight, indentEm, paragraphSpacingEm]) => {
  readerService.updatePreferences({
    textFontSize: fontSize,
    textLineHeight: lineHeight,
    textIndentEm: indentEm,
    textParagraphSpacingEm: paragraphSpacingEm,
  })
  scheduleGalleryTextPagination()
  scheduleGalleryVirtualPagination()
})

function toggleControls(skipDoubleTap = false) {
  if (!skipDoubleTap && handleDoubleTap()) return

  if (ignoreNextTap.value) {
    ignoreNextTap.value = false
    return
  }

  if (readerSettingsVisible.value || chapterSheetVisible.value) return

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
  if (readerSettingsVisible.value || chapterSheetVisible.value) return

  hideTimer = window.setTimeout(() => {
    controlsVisible.value = false
    brightnessVisible.value = false
    pageListVisible.value = false
  }, 3200)
}

function isGalleryTextPage() {
  return readerMode.value === 'gallery' && currentImage.value?.kind === 'text'
}

function scheduleGalleryTextPagination(target: GalleryTextPageTarget = 'keep') {
  if (galleryTextMeasureFrame) {
    window.cancelAnimationFrame(galleryTextMeasureFrame)
  }

  galleryTextMeasureFrame = window.requestAnimationFrame(() => {
    galleryTextMeasureFrame = undefined
    void syncGalleryTextPagination(target)
  })
}

function setGalleryVirtualPageCount(index: number, count: number) {
  if (index < 0 || index >= images.value.length) return
  const nextCounts = [...galleryVirtualPageCounts.value]
  nextCounts[index] = Math.max(1, count)
  galleryVirtualPageCounts.value = nextCounts
}

function galleryTextMetrics(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  return {
    width: Math.max(1, Math.floor(element.clientWidth - horizontalPadding)),
    height: Math.max(1, Math.floor(element.clientHeight - verticalPadding)),
  }
}

function measureGalleryTextHtml(html: string, width: number, height: number) {
  const root = galleryTextMeasureRoot.value
  if (!root) return 1

  const flow = document.createElement('div')
  flow.style.width = `${width}px`
  flow.style.height = `${height}px`
  flow.style.columnFill = 'auto'
  flow.style.columnGap = `${GALLERY_TEXT_PAGE_GAP}px`
  flow.style.columnWidth = `${width}px`
  flow.innerHTML = html

  root.replaceChildren(flow)
  const pageStride = width + GALLERY_TEXT_PAGE_GAP
  return Math.max(1, Math.ceil((flow.scrollWidth + GALLERY_TEXT_PAGE_GAP - 1) / pageStride))
}

function scheduleGalleryVirtualPagination() {
  if (galleryVirtualMeasureFrame) {
    window.cancelAnimationFrame(galleryVirtualMeasureFrame)
  }

  galleryVirtualMeasureFrame = window.requestAnimationFrame(() => {
    galleryVirtualMeasureFrame = undefined
    void syncGalleryVirtualPagination()
  })
}

async function syncGalleryVirtualPagination() {
  await nextTick()

  if (readerMode.value !== 'gallery' || !hasTextPages.value) {
    galleryVirtualPageCounts.value = []
    return
  }

  const root = galleryTextMeasureRoot.value
  if (!root) return

  const { width, height } = galleryTextMetrics(root)
  galleryVirtualPageCounts.value = images.value.map((image) => (
    image.kind === 'text' ? measureGalleryTextHtml(image.html || '', width, height) : 1
  ))
  root.replaceChildren()
  scheduleGalleryTextPagination()
}

async function syncGalleryTextPagination(target: GalleryTextPageTarget = 'keep') {
  await nextTick()

  if (!isGalleryTextPage()) {
    galleryTextPageIndex.value = 0
    galleryTextPageCount.value = 1
    galleryTextPageWidth.value = 0
    return
  }

  const viewport = galleryTextViewport.value
  const flow = galleryTextFlow.value
  if (!viewport || !flow) return

  const nextWidth = Math.max(1, Math.floor(viewport.clientWidth))
  galleryTextPageWidth.value = nextWidth
  await nextTick()

  const pageStride = nextWidth + GALLERY_TEXT_PAGE_GAP
  const nextCount = Math.max(1, Math.ceil((flow.scrollWidth + GALLERY_TEXT_PAGE_GAP - 1) / pageStride))
  galleryTextPageCount.value = nextCount
  setGalleryVirtualPageCount(currentIndex.value, nextCount)

  if (target === 'start') {
    galleryTextPageIndex.value = 0
    return
  }

  if (target === 'end') {
    galleryTextPageIndex.value = nextCount - 1
    return
  }

  if (typeof target === 'number') {
    galleryTextPageIndex.value = Math.min(nextCount - 1, Math.max(0, target))
    return
  }

  galleryTextPageIndex.value = Math.min(galleryTextPageIndex.value, nextCount - 1)
}

function turnGalleryTextPage(delta: 1 | -1) {
  if (!isGalleryTextPage()) return false

  const nextTextPageIndex = galleryTextPageIndex.value + delta
  if (nextTextPageIndex < 0 || nextTextPageIndex >= galleryTextPageCount.value) return false

  galleryTextPageIndex.value = nextTextPageIndex
  scheduleHide()
  return true
}

function previousPage() {
  if (turnGalleryTextPage(-1)) return
  goToPage(currentIndex.value - 1, { animate: true, textPage: 'end' })
}

function nextPage() {
  if (turnGalleryTextPage(1)) return
  goToPage(currentIndex.value + 1, { animate: true, textPage: 'start' })
}

function jumpToStart() {
  goToPage(0, { animate: false, textPage: 'start' })
}

function jumpToEnd() {
  goToPage(lastImageIndex.value, { animate: false, textPage: 'end' })
}

function toggleFavorite() {
  favorite.value = !favorite.value
  libraryService.setShelfState(mangaId.value, { favorite: favorite.value })
  scheduleHide()
}

function toggleBrightness() {
  brightnessVisible.value = !brightnessVisible.value
  pageListVisible.value = false
  closeChapterSheet({ syncHistory: true, scheduleControls: false })
  readerSettingsVisible.value = false
  controlsVisible.value = true
  scheduleHide()
}

function togglePageList() {
  pageListVisible.value = !pageListVisible.value
  brightnessVisible.value = false
  closeChapterSheet({ syncHistory: true, scheduleControls: false })
  readerSettingsVisible.value = false
  controlsVisible.value = true
  scheduleHide()
}

function toggleNavigationPanel() {
  if (hasChapterList.value) {
    if (chapterSheetVisible.value) {
      closeChapterSheet()
    } else {
      openChapterSheet()
    }
    return
  }

  togglePageList()
}

function reloadCurrentPage() {
  const image = images.value[currentIndex.value]
  if (!image) return
  if (image.kind === 'text') {
    scheduleHide()
    return
  }

  if (isCloudReader.value) {
    images.value[currentIndex.value] = {
      ...image,
      src: '',
    }
    void reloadCloudImage(currentIndex.value)
  } else if (image.src.startsWith('blob:')) {
    URL.revokeObjectURL(image.src)
    images.value[currentIndex.value] = {
      ...image,
      src: '',
    }
    void ensureImagesAround(currentIndex.value)
  }

  controlsVisible.value = true
  brightnessVisible.value = false
  pageListVisible.value = false
  closeChapterSheet({ syncHistory: true, scheduleControls: false })
  readerSettingsVisible.value = false
  scheduleHide()
}

async function downloadCurrentCloudManga() {
  if (!isCloudReader.value || downloadBusy.value || cloudDownloaded.value || cloudDownloadQueued.value) return

  downloadBusy.value = true
  downloadMessage.value = '正在准备下载...'
  controlsVisible.value = true
  brightnessVisible.value = false
  pageListVisible.value = false
  closeChapterSheet({ syncHistory: true, scheduleControls: false })
  readerSettingsVisible.value = false
  window.clearTimeout(hideTimer)

  try {
    await downloadService.startWebDav(cloudService.pathFromReaderId(mangaId.value), manga.value?.title)
    cloudDownloadQueued.value = true
    downloadMessage.value = '已加入下载队列，可在下载页查看'
  } catch (error) {
    downloadMessage.value = error instanceof Error ? error.message : '创建下载任务失败'
  } finally {
    downloadBusy.value = false
    scheduleHide()
  }
}

function toggleReaderSettings() {
  readerSettingsVisible.value = !readerSettingsVisible.value
  brightnessVisible.value = false
  pageListVisible.value = false
  closeChapterSheet({ syncHistory: true, scheduleControls: false })
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

function openChapterSheet() {
  if (!hasChapterList.value) return

  chapterSheetVisible.value = true
  chapterSheetTouchOffset.value = 0
  chapterSheetDragging.value = false
  brightnessVisible.value = false
  pageListVisible.value = false
  readerSettingsVisible.value = false
  controlsVisible.value = true
  window.clearTimeout(hideTimer)

  if (!chapterSheetHistoryActive) {
    window.history.pushState({ readerChapterSheet: true }, '', window.location.href)
    chapterSheetHistoryActive = true
  }
}

function closeChapterSheet(options: ChapterSheetCloseOptions = {}) {
  const wasVisible = chapterSheetVisible.value
  chapterSheetVisible.value = false
  chapterSheetTouchOffset.value = 0
  chapterSheetDragging.value = false

  if (options.syncHistory !== false && chapterSheetHistoryActive) {
    chapterSheetHistoryActive = false
    window.history.back()
  }

  if (wasVisible && options.scheduleControls !== false) {
    scheduleHide()
  }
}

function shouldStartChapterSheetDrag(event: TouchEvent) {
  const target = event.target
  return target instanceof HTMLElement && !target.closest('.reader-chapter-sheet-list')
}

function handleChapterSheetTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return

  chapterSheetDragging.value = shouldStartChapterSheetDrag(event)
  chapterSheetTouchStartY.value = touch.clientY
  chapterSheetTouchOffset.value = 0
}

function handleChapterSheetTouchMove(event: TouchEvent) {
  if (!chapterSheetDragging.value) return

  const touch = event.changedTouches[0]
  if (!touch) return

  chapterSheetTouchOffset.value = Math.max(0, touch.clientY - chapterSheetTouchStartY.value)
}

function handleChapterSheetTouchEnd() {
  if (!chapterSheetDragging.value) return

  if (chapterSheetTouchOffset.value > 92) {
    closeChapterSheet()
    return
  }

  chapterSheetTouchOffset.value = 0
  chapterSheetDragging.value = false
}

function togglePageTurnAnimation() {
  pageTurnAnimation.value = !pageTurnAnimation.value
  controlsVisible.value = true
  window.clearTimeout(hideTimer)
}

function toggleImageRoundedCorners() {
  imageRoundedCorners.value = !imageRoundedCorners.value
  controlsVisible.value = true
  window.clearTimeout(hideTimer)
}

function pageTurnDirectionFor(nextIndex: number): PageTurnDirection {
  const movingForward = nextIndex > currentIndex.value
  const visuallyNext = galleryDirection.value === 'right-next' ? movingForward : !movingForward
  return visuallyNext ? 'next' : 'previous'
}

function goToPage(index: number, options: PageNavigationOptions = {}) {
  const nextIndex = Math.min(lastImageIndex.value, Math.max(0, index))
  const currentPageIndex = currentIndex.value
  const shouldAnimate = Boolean(
    options.animate
    && galleryPageTransitionEnabled.value
    && readerMode.value === 'gallery'
    && Math.abs(nextIndex - currentPageIndex) === 1,
  )

  if (shouldAnimate) {
    pageTurnDirection.value = pageTurnDirectionFor(nextIndex)
  }

  pendingGalleryTextPageTarget = options.textPage ?? 'start'
  currentIndex.value = nextIndex
  if (nextIndex === currentPageIndex) {
    scheduleGalleryTextPagination(pendingGalleryTextPageTarget)
    pendingGalleryTextPageTarget = 'start'
  }

  if (isContinuousMode.value) {
    void scrollToCurrentIndex(options.behavior ?? 'smooth')
  }

  scheduleHide()
}

function goToChapter(chapter: ReaderChapter) {
  pageListVisible.value = false
  closeChapterSheet()
  goToPage(chapter.pageIndex)
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
    if (image.kind === 'text') return image
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
  if (image.kind === 'text') return

  const src = isCloudReader.value
    ? await cloudService.loadWebDavImageAssetSrc(cloudService.pathFromReaderId(mangaId.value), image)
    : await libraryService.loadImageAssetSrc(image)
  if (!src) return

  images.value[index] = {
    ...image,
    src,
  }
}

async function reloadCloudImage(index: number) {
  const image = images.value[index]
  if (!image || !isCloudReader.value) return

  try {
    const src = await cloudService.reloadWebDavImageAssetSrc(cloudService.pathFromReaderId(mangaId.value), image)
    if (!src) return
    images.value[index] = {
      ...image,
      src,
    }
  } catch {
    await ensureImageLoaded(index)
  }
}

async function handleImageError(index: number) {
  const image = images.value[index]
  if (!image) return
  if (image.kind === 'text') return

  if (isCloudReader.value) {
    cloudService.releaseWebDavImageAssetSrc(cloudService.pathFromReaderId(mangaId.value), image)
  } else if (image.src.startsWith('blob:')) {
    URL.revokeObjectURL(image.src)
  }

  images.value[index] = {
    ...image,
    src: '',
  }
  await ensureImageLoaded(index)
}

function goToVirtualPage(pageIndex: number) {
  const targetPage = Math.min(readerProgressMax.value, Math.max(0, pageIndex))
  let offset = 0

  for (const [index, count] of galleryNormalizedPageCounts.value.entries()) {
    const nextOffset = offset + count
    if (targetPage < nextOffset) {
      const image = images.value[index]
      const textPage = image?.kind === 'text' ? targetPage - offset : undefined
      goToPage(index, { animate: false, textPage })
      return
    }
    offset = nextOffset
  }

  goToPage(lastImageIndex.value, { animate: false, textPage: 'end' })
}

function handleProgressInput(event: Event) {
  const nextIndex = Number((event.target as HTMLInputElement).value)
  if (isGalleryPagedProgress.value) {
    goToVirtualPage(nextIndex)
    return
  }
  goToPage(nextIndex)
}

function handleGalleryTap(event: MouseEvent) {
  if (handleDoubleTap()) return

  if (ignoreNextTap.value) {
    ignoreNextTap.value = false
    return
  }

  const width = window.innerWidth || (event.currentTarget as HTMLElement).clientWidth
  const height = window.innerHeight || (event.currentTarget as HTMLElement).clientHeight
  const isMiddleTap = event.clientX >= width * 0.32 && event.clientX <= width * 0.68
  const isLowerMiddleTap = event.clientX >= width * 0.24 && event.clientX <= width * 0.76 && event.clientY >= height * 0.48

  if (isMiddleTap || isLowerMiddleTap) {
    toggleControls(true)
    return
  }

  const leftZone = event.clientX < width * 0.24
  const rightZone = event.clientX > width * 0.76
  if (!leftZone && !rightZone) return

  const nextFromLeft = galleryDirection.value === 'left-next'
  if ((leftZone && nextFromLeft) || (rightZone && !nextFromLeft)) {
    nextPage()
    return
  }

  previousPage()
}

function shouldSwipeNext(deltaX: number) {
  const swipedLeft = deltaX < 0
  return galleryDirection.value === 'right-next' ? swipedLeft : !swipedLeft
}

function handleDoubleTap() {
  const now = Date.now()
  if (now - lastTapAt > 280) {
    lastTapAt = now
    return false
  }

  lastTapAt = 0
  fitMode.value = fitMode.value === 'width' ? 'contain' : 'width'
  controlsVisible.value = false
  brightnessVisible.value = false
  pageListVisible.value = false
  readerSettingsVisible.value = false
  window.clearTimeout(hideTimer)

  if (isContinuousMode.value) {
    void scrollToCurrentIndex('auto')
  }

  return true
}

function setReaderMode(mode: ReaderMode) {
  readerMode.value = mode
  controlsVisible.value = true
  window.clearTimeout(hideTimer)
}

function setGalleryMode(direction: ReaderGalleryDirection) {
  readerMode.value = 'gallery'
  galleryDirection.value = direction
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
  if (shouldSwipeNext(deltaX)) {
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
  position: relative;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.gallery-stage.text-stage {
  align-items: stretch;
}

.gallery-page-frame {
  position: absolute;
  inset: 0;
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.gallery-page-frame.text-page-frame {
  align-items: stretch;
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
  border-radius: 0;
  object-fit: contain;
}

.reader-image.rounded {
  border-radius: 12px;
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

.reader-text-page {
  width: min(100%, 760px);
  margin: 0 auto;
  color: var(--color-text);
  font-size: var(--reader-text-font-size, 18px);
  line-height: var(--reader-text-line-height, 1.86);
  orphans: 1;
  overflow-wrap: anywhere;
  widows: 1;
  word-break: break-word;
}

.gallery-text-page {
  box-sizing: border-box;
  height: 100dvh;
  overflow: hidden;
  padding: max(0px, calc(var(--safe-top) - 34px)) 24px calc(var(--safe-bottom) + 34px);
}

.gallery-text-viewport {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.reader-text-flow {
  width: var(--reader-text-page-width, 100%);
  height: 100%;
  column-fill: auto;
  column-gap: var(--reader-text-page-gap, 36px);
  column-width: var(--reader-text-page-width, 100%);
}

.gallery-stage.page-turning .reader-text-flow {
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.reader-text-measure-root {
  position: fixed;
  top: 0;
  left: -200vw;
  z-index: -1;
  pointer-events: none;
  visibility: hidden;
}

.continuous-text-page {
  padding: 34px 24px 44px;
}

.reader-text-page :deep(p) {
  margin: 0 0 var(--reader-text-paragraph-spacing, 1em);
  text-indent: var(--reader-text-indent, 0);
}

.reader-text-page :deep(h1),
.reader-text-page :deep(h2),
.reader-text-page :deep(h3),
.reader-text-page :deep(h4),
.reader-text-page :deep(h5),
.reader-text-page :deep(h6) {
  margin: 1.2em 0 0.72em;
  color: var(--color-accent-bright);
  font-weight: 500;
  line-height: 1.35;
}

.reader-text-page :deep(h1) {
  font-size: 26px;
}

.reader-text-page :deep(h2) {
  font-size: 23px;
}

.reader-text-page :deep(h3) {
  font-size: 21px;
}

.reader-text-page :deep(blockquote) {
  margin: 1.2em 0;
  border-left: 3px solid rgba(225, 194, 150, 0.42);
  padding-left: 14px;
  color: rgba(229, 226, 225, 0.78);
}

.reader-text-page :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 24px auto;
  border-radius: 0;
}

.reader-text-page.rounded-media :deep(img) {
  border-radius: 12px;
}

.reader-text-page :deep(hr) {
  margin: 28px 0;
  border: 0;
  border-top: 1px solid rgba(153, 143, 131, 0.18);
}

.reader-text-page :deep(a) {
  color: var(--color-accent-bright);
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

.reader-title-stack {
  min-width: 0;
  text-align: center;
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

.reader-top small {
  display: block;
  max-width: 210px;
  overflow: hidden;
  margin-top: 3px;
  color: rgba(229, 226, 225, 0.52);
  font-size: 11px;
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

.reader-page-status {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 12;
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 24px calc(10px + var(--safe-bottom));
  color: rgba(229, 226, 225, 0.78);
  font-size: 13px;
  letter-spacing: 0;
  pointer-events: none;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.78);
}

.reader-page-status::before {
  position: absolute;
  inset: -34px 0 0;
  z-index: -1;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0));
  content: '';
}

.reader-device-status,
.reader-chapter-status,
.reader-battery {
  display: inline-flex;
  align-items: center;
}

.reader-device-status {
  flex: 0 0 auto;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}

.reader-battery {
  gap: 5px;
}

.reader-battery.charging {
  color: var(--color-accent-bright);
}

.reader-battery-icon {
  position: relative;
  display: inline-flex;
  width: 18px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-radius: 2px;
}

.reader-battery-icon::after {
  position: absolute;
  top: 2px;
  right: -4px;
  width: 2px;
  height: 4px;
  border-radius: 0 2px 2px 0;
  background: currentColor;
  content: '';
}

.reader-battery-icon i {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: var(--reader-battery-fill, 0px);
  max-width: 14px;
  border-radius: 1px;
  background: currentColor;
}

.reader-chapter-status {
  min-width: 0;
  justify-content: flex-end;
  gap: 10px;
  text-align: right;
}

.reader-status-chapter {
  max-width: min(52vw, 420px);
  overflow: hidden;
  color: rgba(229, 226, 225, 0.86);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-status-page {
  flex: 0 0 auto;
  color: rgba(229, 226, 225, 0.9);
  font-variant-numeric: tabular-nums;
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
  grid-template-columns: repeat(5, minmax(44px, 1fr));
  gap: 10px;
  justify-items: center;
}

.reader-tool {
  color: rgba(209, 197, 183, 0.66);
  background: transparent;
}

.reader-tool:disabled {
  cursor: wait;
  opacity: 0.42;
}

.reader-tool.active {
  color: var(--color-accent);
}

.reader-actions.has-cloud-download {
  grid-template-columns: repeat(6, minmax(40px, 1fr));
  gap: 6px;
}

.reader-download-status {
  margin: -6px 0 14px;
  color: var(--color-accent-bright);
  font-size: 12px;
  text-align: center;
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

.reader-chapter-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 54px;
  border: 1px solid rgba(153, 143, 131, 0.2);
  border-radius: 8px;
  padding: 10px 12px;
  color: rgba(209, 197, 183, 0.72);
  background: rgba(30, 30, 30, 0.72);
  text-align: left;
}

.reader-chapter-item span,
.reader-chapter-item em {
  color: rgba(209, 197, 183, 0.52);
  font-size: 12px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.reader-chapter-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-chapter-item.active {
  border-color: rgba(225, 194, 150, 0.6);
  background: rgba(184, 155, 114, 0.14);
}

.reader-chapter-item.active span,
.reader-chapter-item.active em,
.reader-chapter-item.active strong {
  color: var(--color-accent-bright);
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

.reader-sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 32;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
}

.reader-chapter-sheet {
  width: 100%;
  max-height: min(78dvh, 620px);
  overflow: hidden;
  border: 1px solid rgba(153, 143, 131, 0.2);
  border-bottom: 0;
  border-radius: 22px 22px 0 0;
  padding: 8px 18px calc(var(--safe-bottom) + 18px);
  background: rgba(22, 19, 19, 0.98);
  box-shadow: 0 -18px 56px rgba(0, 0, 0, 0.46);
}

.reader-sheet-handle {
  display: flex;
  width: 100%;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
}

.reader-sheet-handle span {
  width: 42px;
  height: 4px;
  border-radius: 999px;
  background: rgba(209, 197, 183, 0.36);
}

.reader-chapter-sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 2px 0 18px;
}

.reader-chapter-sheet-header h2 {
  margin: 6px 0 0;
  color: var(--color-text);
  font-size: 26px;
  font-weight: 400;
}

.reader-chapter-sheet-list {
  display: grid;
  max-height: calc(min(78dvh, 620px) - 126px - var(--safe-bottom));
  gap: 10px;
  overflow-y: auto;
  padding: 0 2px 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.reader-chapter-sheet-list::-webkit-scrollbar {
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

.reader-toggle-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  width: 100%;
  margin-top: 14px;
  border: 1px solid rgba(153, 143, 131, 0.2);
  border-radius: 18px;
  padding: 16px;
  color: var(--color-text);
  background: rgba(34, 30, 30, 0.72);
  text-align: left;
}

.reader-toggle-option strong {
  display: block;
  font-size: 18px;
  font-weight: 400;
}

.reader-toggle-option div span {
  display: block;
  margin-top: 6px;
  color: rgba(209, 197, 183, 0.68);
  font-size: 13px;
  line-height: 1.7;
}

.reader-toggle-option.active {
  border-color: rgba(225, 194, 150, 0.58);
  background: rgba(184, 155, 114, 0.12);
}

.reader-switch {
  position: relative;
  display: inline-flex;
  width: 48px;
  height: 28px;
  flex: 0 0 auto;
  border: 1px solid rgba(153, 143, 131, 0.26);
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.82);
}

.reader-switch i {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: rgba(209, 197, 183, 0.72);
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), background 180ms ease;
}

.reader-switch.active {
  border-color: rgba(225, 194, 150, 0.62);
  background: rgba(184, 155, 114, 0.2);
}

.reader-switch.active i {
  background: var(--color-accent-bright);
  transform: translate3d(20px, 0, 0);
}

.reader-range-setting {
  display: grid;
  gap: 12px;
  margin-top: 14px;
  border: 1px solid rgba(153, 143, 131, 0.2);
  border-radius: 16px;
  padding: 14px;
  background: rgba(34, 30, 30, 0.72);
}

.reader-range-setting span {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.reader-range-setting strong {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 400;
}

.reader-range-setting em {
  color: var(--color-accent-bright);
  font-size: 13px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.reader-range-setting input {
  width: 100%;
  accent-color: var(--color-accent);
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

.reader-page-slide-next-enter-active,
.reader-page-slide-next-leave-active,
.reader-page-slide-previous-enter-active,
.reader-page-slide-previous-leave-active {
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.reader-page-slide-next-enter-from,
.reader-page-slide-previous-leave-to {
  transform: translate3d(100%, 0, 0);
}

.reader-page-slide-next-leave-to,
.reader-page-slide-previous-enter-from {
  transform: translate3d(-100%, 0, 0);
}

.reader-page-slide-next-enter-to,
.reader-page-slide-next-leave-from,
.reader-page-slide-previous-enter-to,
.reader-page-slide-previous-leave-from {
  transform: translate3d(0, 0, 0);
}

.reader-top-slide-enter-active,
.reader-top-slide-leave-active,
.reader-bottom-slide-enter-active,
.reader-bottom-slide-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.reader-top-slide-enter-from,
.reader-top-slide-leave-to {
  opacity: 0;
  transform: translate3d(0, -12px, 0);
}

.reader-bottom-slide-enter-from,
.reader-bottom-slide-leave-to {
  opacity: 0;
  transform: translate3d(0, 18px, 0);
}

.reader-panel-pop-enter-active,
.reader-panel-pop-leave-active {
  transition: opacity 160ms ease, transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.reader-panel-pop-enter-from,
.reader-panel-pop-leave-to {
  opacity: 0;
  transform: translate3d(0, 8px, 0) scale(0.98);
}

.reader-sheet-enter-active,
.reader-sheet-leave-active {
  transition: opacity 180ms ease;
}

.reader-sheet-enter-active .reader-chapter-sheet,
.reader-sheet-leave-active .reader-chapter-sheet {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.reader-sheet-enter-from,
.reader-sheet-leave-to {
  opacity: 0;
}

.reader-sheet-enter-from .reader-chapter-sheet,
.reader-sheet-leave-to .reader-chapter-sheet {
  transform: translate3d(0, 100%, 0);
}

.reader-drawer-enter-active,
.reader-drawer-leave-active {
  transition: opacity 180ms ease;
}

.reader-drawer-enter-active .reader-settings-drawer,
.reader-drawer-leave-active .reader-settings-drawer {
  transition: transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}

.reader-drawer-enter-from,
.reader-drawer-leave-to {
  opacity: 0;
}

.reader-drawer-enter-from .reader-settings-drawer,
.reader-drawer-leave-to .reader-settings-drawer {
  transform: translate3d(100%, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .reader-page-slide-next-enter-active,
  .reader-page-slide-next-leave-active,
  .reader-page-slide-previous-enter-active,
  .reader-page-slide-previous-leave-active,
  .reader-sheet-enter-active,
  .reader-sheet-leave-active,
  .reader-sheet-enter-active .reader-chapter-sheet,
  .reader-sheet-leave-active .reader-chapter-sheet {
    transition: none;
  }

  .reader-page-slide-next-enter-from,
  .reader-page-slide-next-leave-to,
  .reader-page-slide-previous-enter-from,
  .reader-page-slide-previous-leave-to,
  .reader-sheet-enter-from .reader-chapter-sheet,
  .reader-sheet-leave-to .reader-chapter-sheet {
    transform: translate3d(0, 0, 0);
  }
}
</style>
