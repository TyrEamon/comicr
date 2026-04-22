<template>
  <div class="detail-page">
    <section class="detail-hero">
      <img v-if="coverUrl" class="hero-image" :src="coverUrl" :alt="manga?.title || 'Cover'" />
      <div class="hero-shade" />
      <button class="back-button" type="button" aria-label="返回" @click="router.back()">
        <ArrowLeft :size="24" />
      </button>
      <div class="hero-copy">
        <span class="genre-pill">本地 · 手机端</span>
        <h1>{{ manga?.title || '正在加载' }}</h1>
        <p>{{ manga?.imageCount ?? 0 }} 页 · {{ progressLabel }}</p>
      </div>
    </section>

    <main class="detail-content">
      <section class="action-row">
        <button class="primary-button read-button" type="button" :disabled="!manga" @click="readNow">
          <BookOpen :size="20" />
          开始阅读
        </button>
        <IconButton label="收藏" :active="shelf.favorite" @click="toggleFavorite">
          <Bookmark :size="20" :fill="shelf.favorite ? 'currentColor' : 'none'" />
        </IconButton>
        <IconButton label="稍后看" :active="shelf.readLater" @click="toggleReadLater">
          <Clock3 :size="20" />
        </IconButton>
      </section>

      <section class="stats-grid">
        <div class="surface-card stat-card">
          <span>页数</span>
          <strong>{{ manga?.imageCount ?? 0 }}</strong>
        </div>
        <div class="surface-card stat-card">
          <span>进度</span>
          <strong>{{ progressPercent }}</strong>
        </div>
        <div class="surface-card stat-card">
          <span>来源</span>
          <strong>{{ manga?.source ?? '-' }}</strong>
        </div>
        <div class="surface-card stat-card">
          <span>保存</span>
          <strong>{{ savedDate }}</strong>
        </div>
      </section>

      <section class="chapters-section">
        <div class="section-head">
          <h2>页面</h2>
          <span>共 {{ manga?.imageCount ?? 0 }} 页</span>
        </div>
        <button class="chapter-card surface-card" type="button" @click="readNow">
          <div>
            <strong>继续阅读</strong>
            <p>{{ progressLabel }}</p>
          </div>
          <ChevronRight :size="22" />
        </button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import IconButton from '@/components/mobile/IconButton.vue'
import { libraryService } from '@/services/libraryService'
import type { MangaItem } from '@/services/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { ArrowLeft, BookOpen, Bookmark, ChevronRight, Clock3 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const library = useLibraryStore()
const manga = ref<MangaItem | null>(null)
const coverUrl = ref('')

const mangaId = computed(() => String(route.params.id))
const shelf = computed(() => library.getShelfState(mangaId.value))
const progress = computed(() => libraryService.getProgress(mangaId.value))

const progressPercent = computed(() => {
  const value = progress.value?.progressPercent ?? 0
  return `${Math.round(value * 100)}%`
})

const progressLabel = computed(() => {
  const value = progress.value
  if (!value) return '尚未开始'
  return `第 ${value.lastIndex + 1} / ${value.totalImages} 页`
})

const savedDate = computed(() => {
  if (!manga.value) return '-'
  return new Date(manga.value.addedAt).toLocaleDateString()
})

onMounted(async () => {
  if (library.mangas.length === 0) {
    await library.load()
  }
  manga.value = await libraryService.getManga(mangaId.value) ?? null
  coverUrl.value = await libraryService.getCoverUrl(mangaId.value)
})

function readNow() {
  if (!manga.value) return
  router.push(`/reader/${manga.value.id}`)
}

function toggleFavorite() {
  library.toggleFavorite(mangaId.value)
}

function toggleReadLater() {
  library.toggleReadLater(mangaId.value)
}
</script>

<style scoped>
.detail-page {
  min-height: 100dvh;
  background: var(--color-bg);
}

.detail-hero {
  position: relative;
  height: 58dvh;
  min-height: 430px;
  overflow: hidden;
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.18), rgba(15, 15, 15, 0.98));
}

.back-button {
  position: absolute;
  top: 18px;
  left: 18px;
  display: inline-flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: var(--color-accent);
  background: rgba(15, 15, 15, 0.48);
}

.hero-copy {
  position: absolute;
  right: 22px;
  bottom: 28px;
  left: 22px;
}

.genre-pill {
  display: inline-flex;
  margin-bottom: 14px;
  border: 1px solid rgba(225, 194, 150, 0.22);
  border-radius: 999px;
  padding: 7px 12px;
  color: var(--color-accent);
  background: rgba(184, 155, 114, 0.08);
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hero-copy h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 400;
}

.hero-copy p {
  margin: 8px 0 0;
  color: rgba(209, 197, 183, 0.8);
}

.detail-content {
  width: min(100%, 760px);
  margin: 0 auto;
  padding: 0 22px 42px;
}

.action-row {
  display: grid;
  grid-template-columns: 1fr 56px 56px;
  gap: 12px;
  margin-bottom: 34px;
}

.read-button {
  min-height: 56px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 36px;
}

.stat-card {
  padding: 18px;
}

.stat-card span {
  display: block;
  margin-bottom: 10px;
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.stat-card strong {
  font-size: 18px;
  font-weight: 400;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-head h2 {
  margin: 0;
  color: var(--color-accent);
  font-size: 13px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.section-head span {
  color: rgba(209, 197, 183, 0.6);
  font-size: 12px;
}

.chapter-card {
  display: flex;
  width: 100%;
  min-height: 76px;
  align-items: center;
  justify-content: space-between;
  border: 0;
  padding: 18px;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.chapter-card p {
  margin: 6px 0 0;
  color: rgba(209, 197, 183, 0.62);
}
</style>
