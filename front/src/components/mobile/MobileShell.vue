<template>
  <div class="app-shell" :class="{ fullscreen }">
    <MobileTopBar v-if="!fullscreen" :title="title" @menu="openMenu" @search="handleSearch" />
    <div v-if="searchOpen" class="search-dismiss-layer" aria-hidden="true" />
    <Transition name="search-pop">
      <div v-if="searchOpen" class="floating-search" @click.stop>
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="text-input"
          type="search"
          :placeholder="`搜索${title}`"
          aria-label="搜索"
          @input="emitSearch"
          @keydown.enter.prevent="finishSearchInput"
        />
      </div>
    </Transition>
    <main class="app-content" :class="{ 'with-bottom-nav': showBottomNav }">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav" />

    <Transition name="import-status-pop">
      <div
        v-if="showImportStatus"
        class="global-import-status"
        :class="[`is-${importTask.status}`, { 'above-bottom-nav': showBottomNav }]"
        role="status"
        aria-live="polite"
      >
        <component :is="importStatusIcon" :size="18" class="global-import-status-icon" aria-hidden="true" />
        <span>{{ importTask.message }}</span>
        <button
          v-if="importTask.canClear"
          class="global-import-status-close"
          type="button"
          aria-label="关闭导入状态"
          @click="importTask.clear()"
        >
          <X :size="17" />
        </button>
      </div>
    </Transition>

    <Transition name="scrim-fade">
      <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false" />
    </Transition>
    <Transition name="side-drawer">
      <aside v-if="menuOpen" class="side-menu" aria-label="快捷菜单">
        <div class="side-menu-header">
          <div>
            <span class="brand">漫画云读</span>
            <p>快捷入口</p>
          </div>
          <button class="top-icon" type="button" aria-label="关闭菜单" @click="menuOpen = false">
            <X :size="22" />
          </button>
        </div>

        <nav class="side-menu-links">
          <RouterLink v-for="item in menuItems" :key="item.path" :to="item.path" @click="menuOpen = false">
            <component :is="item.icon" :size="20" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </aside>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { AlertCircle, BookOpen, CheckCircle2, Cloud, Compass, Download, LoaderCircle, Settings, X } from 'lucide-vue-next'
import { useImportTaskStore } from '@/stores/importTaskStore'
import MobileBottomNav from './MobileBottomNav.vue'
import MobileTopBar from './MobileTopBar.vue'

const route = useRoute()
const importTask = useImportTaskStore()
const menuOpen = ref(false)
const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const fullscreen = computed(() => Boolean(route.meta.fullscreen))
const showBottomNav = computed(() => !fullscreen.value && !route.meta.hideBottomNav)
const showImportStatus = computed(() => !fullscreen.value && importTask.visible)
const importStatusIcon = computed(() => {
  if (importTask.status === 'failed') return AlertCircle
  if (importTask.status === 'completed') return CheckCircle2
  return LoaderCircle
})
const title = computed(() => String(route.meta.title ?? '书库'))

const menuItems = [
  { path: '/', label: '书库', icon: BookOpen },
  { path: '/online', label: '发现', icon: Compass },
  { path: '/download', label: '下载', icon: Download },
  { path: '/cloud', label: '云盘', icon: Cloud },
  { path: '/setting', label: '设置', icon: Settings },
]

watch(() => route.fullPath, () => {
  menuOpen.value = false
  closeSearch()
})

async function handleSearch() {
  if (searchOpen.value) {
    closeSearch()
    return
  }

  searchOpen.value = true
  await nextTick()
  searchInput.value?.focus()
  emitSearch()
}

function openMenu() {
  closeSearch()
  menuOpen.value = true
}

function closeSearch() {
  searchOpen.value = false
  searchQuery.value = ''
  emitSearch()
}

function finishSearchInput() {
  searchInput.value?.blur()
}

function emitSearch() {
  window.dispatchEvent(new CustomEvent('app-search', { detail: searchQuery.value }))
}
</script>

<style scoped>
.floating-search {
  position: fixed;
  top: calc(var(--top-bar-height) + 8px);
  right: 14px;
  left: 14px;
  z-index: 50;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  background: rgba(28, 27, 27, 0.96);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(18px);
}

.search-dismiss-layer {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: transparent;
  pointer-events: none;
}

.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(2px);
}

.side-menu {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 70;
  width: min(82vw, 320px);
  padding: calc(22px + var(--safe-top)) 18px 22px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(16, 16, 16, 0.98);
  box-shadow: 24px 0 60px rgba(0, 0, 0, 0.42);
}

.side-menu-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.side-menu-header p {
  margin: 8px 0 0;
  color: rgba(209, 197, 183, 0.62);
  font-size: 13px;
}

.side-menu-links {
  display: grid;
  gap: 8px;
}

.side-menu-links a {
  display: flex;
  min-height: 52px;
  align-items: center;
  gap: 12px;
  border-radius: 14px;
  padding: 0 14px;
  color: rgba(229, 226, 225, 0.78);
  text-decoration: none;
  transition: background 180ms ease, color 180ms ease;
}

.side-menu-links a.router-link-active {
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.12);
}

.global-import-status {
  position: fixed;
  right: 14px;
  bottom: calc(18px + var(--safe-bottom));
  left: 14px;
  z-index: 55;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 50px;
  border: 1px solid rgba(225, 194, 150, 0.22);
  border-radius: 16px;
  padding: 10px 12px;
  color: var(--color-text);
  background: rgba(23, 22, 22, 0.96);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.36);
  backdrop-filter: blur(18px);
}

.global-import-status.above-bottom-nav {
  bottom: calc(94px + var(--safe-bottom));
}

.global-import-status span {
  overflow: hidden;
  color: rgba(229, 226, 225, 0.86);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.global-import-status-icon {
  color: var(--color-accent-bright);
}

.global-import-status.is-running .global-import-status-icon {
  animation: import-status-spin 1s linear infinite;
}

.global-import-status.is-failed {
  border-color: rgba(252, 165, 165, 0.3);
}

.global-import-status.is-failed .global-import-status-icon {
  color: #fca5a5;
}

.global-import-status-close {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  color: rgba(209, 197, 183, 0.72);
  background: transparent;
}

.global-import-status-close:active {
  color: var(--color-accent-bright);
  background: rgba(184, 155, 114, 0.12);
}

.import-status-pop-enter-active,
.import-status-pop-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.import-status-pop-enter-from,
.import-status-pop-leave-to {
  opacity: 0;
  transform: translate3d(0, 10px, 0) scale(0.98);
}

@keyframes import-status-spin {
  to {
    transform: rotate(360deg);
  }
}

.search-pop-enter-active,
.search-pop-leave-active {
  transition: opacity 180ms ease, transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.search-pop-enter-from,
.search-pop-leave-to {
  opacity: 0;
  transform: translate3d(0, -8px, 0) scale(0.98);
}

.scrim-fade-enter-active,
.scrim-fade-leave-active {
  transition: opacity 180ms ease;
}

.scrim-fade-enter-from,
.scrim-fade-leave-to {
  opacity: 0;
}

.side-drawer-enter-active,
.side-drawer-leave-active {
  transition: opacity 190ms ease, transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: opacity, transform;
}

.side-drawer-enter-from,
.side-drawer-leave-to {
  opacity: 0;
  transform: translate3d(-18px, 0, 0);
}
</style>
