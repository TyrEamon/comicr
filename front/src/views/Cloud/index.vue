<template>
  <div class="page cloud-page">
    <section class="storage-overview">
      <p class="label-caps">云盘同步</p>
      <div class="storage-row">
        <div>
          <h1 class="page-title">总存储</h1>
        </div>
        <strong>{{ library.count }} 本</strong>
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
          <p>{{ provider.connected ? '已连接' : '未连接' }}</p>
          <small>{{ provider.description }}</small>
        </div>
        <button
          class="ghost-button setup-button"
          type="button"
          :disabled="!provider.connected"
          @click="selectProvider(provider.id)"
        >
          打开
        </button>
      </article>
    </section>

    <section v-if="selectedProvider === 'local-archive'" class="local-import surface-card">
      <div>
        <p class="label-caps">本地导入</p>
        <h2>漫画库管理</h2>
        <p>本地漫画导入已经放到设置页，云盘页后续专注 WebDAV 和远程资源。</p>
      </div>
      <RouterLink class="primary-button local-import-link" to="/setting">去设置</RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { cloudService } from '@/services/cloudService'
import type { ProviderSummary } from '@/services/types'
import { useLibraryStore } from '@/stores/libraryStore'
import { Cloud as CloudIcon, CloudOff } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

const providers = ref<ProviderSummary[]>([])
const selectedProvider = ref('local-archive')
const library = useLibraryStore()

onMounted(async () => {
  providers.value = await cloudService.listProviders()
  await library.load()
})

function selectProvider(providerId: string) {
  selectedProvider.value = providerId
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

.local-import-link {
  text-decoration: none;
}
</style>
