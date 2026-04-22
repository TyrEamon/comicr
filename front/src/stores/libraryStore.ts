import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { libraryService } from '@/services/libraryService'
import type { MangaItem } from '@/services/types'

export const useLibraryStore = defineStore('library', () => {
  const mangas = ref<MangaItem[]>([])
  const coverUrls = ref<Record<string, string>>({})
  const loading = ref(false)
  const version = ref(0)

  const count = computed(() => mangas.value.length)

  async function load() {
    loading.value = true
    try {
      mangas.value = await libraryService.listMangas()
      const nextCoverUrls: Record<string, string> = {}
      await Promise.all(
        mangas.value.map(async (manga) => {
          nextCoverUrls[manga.id] = await libraryService.getCoverUrl(manga.id)
        }),
      )
      coverUrls.value = nextCoverUrls
      version.value += 1
    } finally {
      loading.value = false
    }
  }

  async function importArchive(file: File, title?: string) {
    const manga = await libraryService.importArchive(file, 'archive', title)
    await load()
    return manga
  }

  async function importImageFiles(files: File[], title?: string) {
    const manga = await libraryService.importImageFiles(files, 'archive', title)
    await load()
    return manga
  }

  async function deleteManga(mangaId: string) {
    await libraryService.deleteManga(mangaId)
    await load()
  }

  function getShelfState(mangaId: string) {
    version.value
    return libraryService.getShelfState(mangaId)
  }

  function toggleFavorite(mangaId: string) {
    const state = libraryService.getShelfState(mangaId)
    libraryService.setShelfState(mangaId, { favorite: !state.favorite })
    version.value += 1
  }

  function toggleReadLater(mangaId: string) {
    const state = libraryService.getShelfState(mangaId)
    libraryService.setShelfState(mangaId, { readLater: !state.readLater })
    version.value += 1
  }

  function togglePinned(mangaId: string) {
    const state = libraryService.getShelfState(mangaId)
    libraryService.setShelfState(mangaId, { pinned: !state.pinned })
    version.value += 1
  }

  return {
    mangas,
    coverUrls,
    loading,
    count,
    load,
    importArchive,
    importImageFiles,
    deleteManga,
    getShelfState,
    toggleFavorite,
    toggleReadLater,
    togglePinned,
  }
})
