<template>
  <section class="manga-grid" aria-label="漫画书库">
    <MangaCard
      v-for="manga in mangas"
      :key="manga.id"
      :manga="manga"
      :cover-url="coverUrls[manga.id] ?? ''"
      :shelf="getShelfState(manga.id)"
      @favorite="$emit('favorite', $event)"
      @read-later="$emit('readLater', $event)"
      @pin="$emit('pin', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import type { MangaItem, ShelfState } from '@/services/types'
import MangaCard from './MangaCard.vue'

defineProps<{
  mangas: MangaItem[]
  coverUrls: Record<string, string>
  getShelfState: (mangaId: string) => ShelfState
}>()

defineEmits<{
  favorite: [mangaId: string]
  readLater: [mangaId: string]
  pin: [mangaId: string]
}>()
</script>

<style scoped>
.manga-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 16px;
}

@media (min-width: 700px) {
  .manga-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
