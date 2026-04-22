<template>
  <article class="manga-card">
    <button class="cover-button" type="button" @click="openDetail">
      <img v-if="coverUrl" class="cover-image" :src="coverUrl" :alt="manga.title" loading="lazy" />
      <div v-else class="cover-empty">暂无封面</div>
      <div class="cover-flags">
        <Bookmark v-if="shelf.favorite" :size="22" fill="currentColor" />
      </div>
    </button>

    <div class="card-copy">
      <button class="title-button" type="button" @click="openDetail">{{ manga.title }}</button>
      <p>{{ manga.imageCount }} 页 · {{ sourceLabel }}</p>
    </div>

    <div class="card-actions" aria-label="书架操作">
      <button class="mini-action" :class="{ active: shelf.favorite }" type="button" aria-label="收藏" @click="$emit('favorite', manga.id)">
        <Bookmark :size="16" :fill="shelf.favorite ? 'currentColor' : 'none'" />
      </button>
      <button class="mini-action" :class="{ active: shelf.readLater }" type="button" aria-label="稍后看" @click="$emit('readLater', manga.id)">
        <Clock3 :size="16" />
      </button>
      <button class="mini-action" :class="{ active: shelf.pinned }" type="button" aria-label="置顶" @click="$emit('pin', manga.id)">
        <Pin :size="16" />
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { MangaItem, ShelfState } from '@/services/types'
import { Bookmark, Clock3, Pin } from 'lucide-vue-next'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  manga: MangaItem
  coverUrl: string
  shelf: ShelfState
}>()

defineEmits<{
  favorite: [mangaId: string]
  readLater: [mangaId: string]
  pin: [mangaId: string]
}>()

const router = useRouter()

const sourceLabel = computed(() => {
  switch (props.manga.source) {
    case 'cloud':
      return '云盘'
    case 'download':
      return '下载'
    case 'folder':
      return '文件夹'
    case 'sample':
      return '示例'
    default:
      return '导入'
  }
})

function openDetail() {
  router.push(`/manga/${props.manga.id}`)
}
</script>

<style scoped>
.manga-card {
  min-width: 0;
}

.cover-button {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border: 0;
  border-radius: 16px;
  padding: 0;
  background: var(--color-surface);
  cursor: pointer;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: grayscale(1);
}

.cover-empty {
  display: grid;
  height: 100%;
  place-items: center;
  color: rgba(209, 197, 183, 0.42);
  font-size: 12px;
}

.cover-flags {
  position: absolute;
  top: 10px;
  right: 10px;
  color: var(--color-accent);
}

.card-copy {
  padding-top: 10px;
}

.title-button {
  display: block;
  width: 100%;
  border: 0;
  padding: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  font-size: 15px;
  line-height: 1.35;
  cursor: pointer;
}

.card-copy p {
  margin: 4px 0 0;
  color: rgba(209, 197, 183, 0.62);
  font-size: 12px;
}

.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 10px;
}

.mini-action {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(153, 143, 131, 0.22);
  border-radius: 10px;
  color: rgba(209, 197, 183, 0.66);
  background: transparent;
  cursor: pointer;
}

.mini-action.active {
  border-color: rgba(225, 194, 150, 0.56);
  color: var(--color-accent);
  background: rgba(184, 155, 114, 0.1);
}
</style>
