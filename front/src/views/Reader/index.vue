<template>
  <div class="reader-view" @click="toggleControls">
    <div v-if="loading" class="reader-loading">Loading pages...</div>

    <template v-else>
      <img
        v-if="currentImage"
        class="reader-image"
        :src="currentImage.src"
        :alt="currentImage.name"
        @click.stop="toggleControls"
      />

      <div v-if="controlsVisible" class="reader-top" @click.stop>
        <button class="reader-icon" type="button" aria-label="Back" @click="router.back()">
          <ArrowLeft :size="24" />
        </button>
        <div>
          <span>Library</span>
          <strong>{{ manga?.title || 'Reader' }}</strong>
        </div>
        <button class="reader-icon" type="button" aria-label="Bookmark">
          <Bookmark :size="22" />
        </button>
      </div>

      <div v-if="controlsVisible" class="reader-bottom" @click.stop>
        <div class="reader-actions">
          <button class="reader-tool" type="button" aria-label="Previous page" @click="previousPage">
            <ChevronLeft :size="24" />
          </button>
          <button class="reader-tool active" type="button" aria-label="Reading mode">
            <PanelTop :size="22" />
          </button>
          <button class="reader-tool" type="button" aria-label="Next page" @click="nextPage">
            <ChevronRight :size="24" />
          </button>
        </div>

        <div class="reader-progress">
          <span>{{ currentIndex + 1 }}</span>
          <input
            v-model.number="currentIndex"
            type="range"
            min="0"
            :max="Math.max(0, images.length - 1)"
            step="1"
            aria-label="Page progress"
          />
          <span>{{ images.length }}</span>
        </div>
        <div class="progress-label">Page Progress</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { libraryService } from '@/services/libraryService'
import type { ImageAsset, MangaItem } from '@/services/types'
import { ArrowLeft, Bookmark, ChevronLeft, ChevronRight, PanelTop } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const manga = ref<MangaItem | null>(null)
const images = ref<ImageAsset[]>([])
const currentIndex = ref(0)
const controlsVisible = ref(true)
const loading = ref(true)
let hideTimer: number | undefined

const mangaId = computed(() => String(route.params.id))
const currentImage = computed(() => images.value[currentIndex.value] ?? null)

onMounted(async () => {
  loading.value = true
  manga.value = await libraryService.getManga(mangaId.value) ?? null
  images.value = await libraryService.getImageAssets(mangaId.value)
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

.reader-loading {
  color: rgba(229, 226, 225, 0.7);
}

.reader-image {
  max-width: 100%;
  max-height: 100dvh;
  object-fit: contain;
}

.reader-top {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  height: 72px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
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
.reader-tool {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: var(--color-accent);
  background: rgba(30, 30, 30, 0.76);
}

.reader-bottom {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 20;
  padding: 76px 24px 42px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.95), rgba(0, 0, 0, 0));
}

.reader-actions {
  display: flex;
  justify-content: center;
  gap: 34px;
  margin-bottom: 24px;
}

.reader-tool {
  color: rgba(209, 197, 183, 0.66);
}

.reader-tool.active {
  color: var(--color-accent);
}

.reader-progress {
  display: grid;
  grid-template-columns: 34px 1fr 34px;
  align-items: center;
  gap: 14px;
  color: rgba(209, 197, 183, 0.62);
}

.reader-progress input {
  width: 100%;
  accent-color: var(--color-accent);
}

.progress-label {
  margin-top: 12px;
  color: rgba(209, 197, 183, 0.38);
  text-align: center;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
</style>
