<template>
  <div class="page download-page">
    <section class="download-hero">
      <p class="label-caps">Downloads</p>
      <h1 class="page-title">Downloads</h1>
      <p class="page-subtitle">Paste a direct image or supported page link. Completed downloads are added to Library.</p>
    </section>

    <section class="download-box surface-card">
      <input v-model="url" class="text-input" type="url" placeholder="Paste download link" aria-label="Download link" @keydown.enter="startDownload" />
      <button class="primary-button" type="button" :disabled="submitting" @click="startDownload">
        <DownloadIcon :size="18" />
        Download
      </button>
    </section>

    <p v-if="message" class="message">{{ message }}</p>

    <div class="tabs">
      <button class="tab-button" :class="{ active: activeTab === 'active' }" type="button" @click="activeTab = 'active'">Active</button>
      <button class="tab-button" :class="{ active: activeTab === 'completed' }" type="button" @click="activeTab = 'completed'">Completed</button>
    </div>

    <section v-if="visibleTasks.length > 0" class="task-list">
      <article v-for="task in visibleTasks" :key="task.id" class="task-card surface-card">
        <div class="task-main">
          <div class="task-thumb">
            <DownloadIcon :size="24" />
          </div>
          <div class="task-copy">
            <h2>{{ task.name }}</h2>
            <p>{{ task.url }}</p>
            <div class="task-meta">
              <span>{{ task.status }}</span>
              <span>{{ task.current }} / {{ task.total || '-' }}</span>
            </div>
          </div>
          <button
            v-if="canCancel(task.status)"
            class="cancel-button"
            type="button"
            aria-label="Cancel task"
            @click="cancelTask(task.id)"
          >
            <X :size="22" />
          </button>
        </div>

        <div class="progress-line">
          <div :style="{ width: `${progressPercent(task)}%` }" />
        </div>
        <p v-if="task.error" class="task-error">{{ task.error }}</p>
      </article>
    </section>

    <section v-else class="empty-state surface-card">
      <DownloadIcon :size="32" />
      <h2>{{ activeTab === 'active' ? 'No active tasks' : 'No completed tasks' }}</h2>
      <p>New downloads will appear here as compact mobile-friendly cards.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { downloadService } from '@/services/downloadService'
import type { DownloadStatus, DownloadTask } from '@/services/types'
import { Download as DownloadIcon, X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'

type Tab = 'active' | 'completed'

const url = ref('')
const activeTab = ref<Tab>('active')
const tasks = ref<DownloadTask[]>([])
const message = ref('')
const submitting = ref(false)
let pollTimer: number | undefined

const visibleTasks = computed(() => {
  if (activeTab.value === 'active') {
    return tasks.value.filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status))
  }
  return tasks.value.filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
})

onMounted(() => {
  refresh()
  pollTimer = window.setInterval(refresh, 900)
})

onUnmounted(() => {
  window.clearInterval(pollTimer)
})

function refresh() {
  tasks.value = downloadService.listTasks()
}

async function startDownload() {
  if (!url.value.trim()) {
    message.value = 'Paste a link first.'
    return
  }

  submitting.value = true
  try {
    await downloadService.start(url.value)
    message.value = 'Download task added.'
    activeTab.value = 'active'
    url.value = ''
    refresh()
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Failed to create download task.'
  } finally {
    submitting.value = false
  }
}

function cancelTask(taskId: string) {
  downloadService.cancel(taskId)
  refresh()
}

function canCancel(status: DownloadStatus) {
  return status === 'pending' || status === 'parsing' || status === 'downloading'
}

function progressPercent(task: DownloadTask) {
  if (task.total <= 0) return task.status === 'completed' ? 100 : 0
  return Math.round((task.current / task.total) * 100)
}
</script>

<style scoped>
.download-hero {
  margin-bottom: 26px;
}

.download-box {
  display: grid;
  gap: 14px;
  margin-bottom: 22px;
  padding: 16px;
}

.message {
  color: var(--color-accent);
  font-size: 13px;
}

.tabs {
  display: flex;
  gap: 28px;
  margin: 26px 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-button {
  min-height: 46px;
  border: 0;
  border-bottom: 2px solid transparent;
  color: rgba(209, 197, 183, 0.48);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.tab-button.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.task-list {
  display: grid;
  gap: 16px;
}

.task-card {
  padding: 18px;
}

.task-main {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 44px;
  gap: 14px;
  align-items: start;
}

.task-thumb {
  display: grid;
  width: 64px;
  height: 86px;
  place-items: center;
  border-radius: 12px;
  color: var(--color-accent);
  background: var(--color-surface-high);
}

.task-copy {
  min-width: 0;
}

.task-copy h2 {
  margin: 2px 0 8px;
  color: var(--color-text);
  font-size: 17px;
  font-weight: 400;
}

.task-copy p {
  overflow: hidden;
  margin: 0;
  color: rgba(209, 197, 183, 0.55);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  color: rgba(209, 197, 183, 0.66);
  font-size: 12px;
  text-transform: uppercase;
}

.cancel-button {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  color: rgba(209, 197, 183, 0.62);
  background: transparent;
}

.progress-line {
  height: 2px;
  margin: 18px 0 0 78px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.progress-line div {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  transition: width 180ms ease;
}

.task-error {
  margin: 12px 0 0 78px;
  color: #ffb4ab;
  font-size: 12px;
}

.empty-state {
  display: grid;
  min-height: 260px;
  place-items: center;
  gap: 12px;
  padding: 28px;
  color: rgba(209, 197, 183, 0.68);
  text-align: center;
}

.empty-state h2 {
  margin: 0;
  color: var(--color-text);
  font-weight: 400;
}

.empty-state p {
  max-width: 300px;
  margin: 0;
  line-height: 1.7;
}
</style>
