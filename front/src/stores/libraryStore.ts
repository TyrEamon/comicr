import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { libraryService } from '@/services/libraryService'
import type { MangaItem, MangaSource } from '@/services/types'

export const useLibraryStore = defineStore('library', () => {
  const mangas = ref<MangaItem[]>([])
  const coverUrls = ref<Record<string, string>>({})
  const loading = ref(false)
  const version = ref(0)
  let loadToken = 0

  const count = computed(() => mangas.value.length)

  async function load() {
    const currentToken = Date.now()
    loadToken = currentToken
    loading.value = true
    try {
      const nextMangas = await libraryService.listMangas()
      if (loadToken !== currentToken) return

      mangas.value = nextMangas
      coverUrls.value = nextMangas.reduce<Record<string, string>>((record, manga) => {
        record[manga.id] = coverUrls.value[manga.id] ?? ''
        return record
      }, {})
      version.value += 1
    } finally {
      if (loadToken === currentToken) {
        loading.value = false
      }
    }

    void loadCovers(currentToken)
  }

  async function loadCovers(token: number) {
    for (const manga of mangas.value) {
      if (loadToken !== token) return
      if (coverUrls.value[manga.id]) continue

      try {
        const coverUrl = await libraryService.getCoverUrl(manga.id)
        if (loadToken !== token) return
        coverUrls.value = {
          ...coverUrls.value,
          [manga.id]: coverUrl,
        }
      } catch {
        if (loadToken !== token) return
        coverUrls.value = {
          ...coverUrls.value,
          [manga.id]: '',
        }
      }
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

  async function importImageBlobs(
    title: string,
    images: Array<{ name: string; type?: string; blob: Blob }>,
    source: MangaSource = 'archive',
  ) {
    const manga = await libraryService.importImageBlobs(title, images, source)
    await load()
    return manga
  }

  async function importImageRefs(
    title: string,
    images: Array<{ name: string; type?: string; uri: string }>,
    source: MangaSource = 'folder',
  ) {
    return libraryService.importImageRefs(title, images, source)
  }

  async function importArchiveRefs(
    title: string,
    images: Array<{ name: string; type?: string; archiveUri: string; entryName: string }>,
  ) {
    const manga = await libraryService.importArchiveRefs(title, images)
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
    importImageBlobs,
    importImageRefs,
    importArchiveRefs,
    deleteManga,
    getShelfState,
    toggleFavorite,
    toggleReadLater,
    togglePinned,
  }
})
