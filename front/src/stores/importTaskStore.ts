import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

type ImportTaskStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface ImportTaskManga {
  id: string
  title: string
}

export const useImportTaskStore = defineStore('importTask', () => {
  const status = ref<ImportTaskStatus>('idle')
  const message = ref('')
  const importedManga = ref<ImportTaskManga | null>(null)
  const updatedAt = ref(0)

  const visible = computed(() => status.value !== 'idle' && Boolean(message.value))
  const running = computed(() => status.value === 'running')
  const canClear = computed(() => status.value === 'completed' || status.value === 'failed')

  function touch() {
    updatedAt.value = Date.now()
  }

  function start(nextMessage: string) {
    status.value = 'running'
    message.value = nextMessage
    importedManga.value = null
    touch()
  }

  function progress(nextMessage: string) {
    status.value = 'running'
    message.value = nextMessage
    touch()
  }

  function complete(nextMessage: string, manga: ImportTaskManga | null = null) {
    status.value = 'completed'
    message.value = nextMessage
    importedManga.value = manga
    touch()
  }

  function fail(nextMessage: string) {
    status.value = 'failed'
    message.value = nextMessage
    importedManga.value = null
    touch()
  }

  function clear() {
    status.value = 'idle'
    message.value = ''
    importedManga.value = null
    touch()
  }

  return {
    status,
    message,
    importedManga,
    updatedAt,
    visible,
    running,
    canClear,
    start,
    progress,
    complete,
    fail,
    clear,
  }
})
