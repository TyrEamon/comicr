<template>
  <div class="page cloud-page">
    <section class="storage-overview">
      <p class="label-caps">Cloud Sync</p>
      <div class="storage-row">
        <div>
          <h1 class="page-title">Total Storage</h1>
          <p class="page-subtitle">Local provider first, WebDAV next.</p>
        </div>
        <strong>{{ library.count }} books</strong>
      </div>
      <div class="storage-bar">
        <div style="width: 24%" />
      </div>
    </section>

    <section class="provider-list">
      <article v-for="provider in providers" :key="provider.id" class="provider-card surface-card" :class="{ dim: !provider.connected }">
        <div class="provider-icon">
          <CloudIcon v-if="provider.connected" :size="28" />
          <CloudOff v-else :size="28" />
        </div>
        <div>
          <h2>{{ provider.name }}</h2>
          <p>{{ provider.connected ? 'Connected' : 'Not connected' }}</p>
          <small>{{ provider.description }}</small>
        </div>
        <button
          class="ghost-button setup-button"
          type="button"
          :disabled="!provider.connected"
          @click="selectProvider(provider.id)"
        >
          Open
        </button>
      </article>
    </section>

    <section v-if="selectedProvider === 'local-archive'" class="local-import surface-card">
      <div>
        <p class="label-caps">Local Provider</p>
        <h2>Import ZIP / CBZ</h2>
        <p>Use this as the MVP cloud lane. It validates the same import path before WebDAV is added.</p>
      </div>
      <button class="primary-button" type="button" @click="fileInput?.click()">
        <Archive :size="18" />
        Choose File
      </button>
      <input ref="fileInput" class="hidden-input" type="file" accept=".zip,.cbz,application/zip" @change="handleImport" />
    </section>

    <p v-if="message" class="message">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { cloudService } from '@/services/cloudService'
import type { ProviderSummary } from '@/services/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { Archive, Cloud as CloudIcon, CloudOff } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

const providers = ref<ProviderSummary[]>([])
const selectedProvider = ref('local-archive')
const fileInput = ref<HTMLInputElement | null>(null)
const message = ref('')
const library = useLibraryStore()

onMounted(async () => {
  providers.value = await cloudService.listProviders()
  await library.load()
})

function selectProvider(providerId: string) {
  selectedProvider.value = providerId
}

async function handleImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  message.value = 'Importing from local provider...'
  try {
    const result = await cloudService.importArchive(file)
    await library.load()
    message.value = `Imported ${result.title} (${result.fileCount} pages)`
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Cloud import failed'
  } finally {
    input.value = ''
  }
}
</script>

<style scoped>
.storage-overview {
  margin-bottom: 42px;
}

.storage-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.storage-row strong {
  margin-bottom: 6px;
  color: var(--color-accent-bright);
  font-size: 24px;
  font-weight: 300;
  white-space: nowrap;
}

.storage-bar {
  height: 8px;
  margin-top: 22px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-surface-high);
}

.storage-bar div {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
}

.provider-list {
  display: grid;
  gap: 16px;
}

.provider-card {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  padding: 20px;
}

.provider-card.dim {
  opacity: 0.58;
}

.provider-icon {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 14px;
  color: var(--color-accent);
  background: var(--color-surface-high);
}

.provider-card h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 400;
}

.provider-card p {
  margin: 6px 0;
  color: #34d399;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.provider-card small {
  display: block;
  color: rgba(209, 197, 183, 0.55);
  line-height: 1.5;
}

.setup-button {
  min-height: 40px;
  padding-inline: 14px;
}

.local-import {
  display: grid;
  gap: 18px;
  margin-top: 34px;
  padding: 22px;
}

.local-import h2 {
  margin: 8px 0;
  font-size: 24px;
  font-weight: 400;
}

.local-import p:not(.label-caps) {
  margin: 0;
  color: rgba(209, 197, 183, 0.66);
  line-height: 1.7;
}

.hidden-input {
  display: none;
}

.message {
  margin-top: 18px;
  color: var(--color-accent);
  font-size: 13px;
}
</style>

