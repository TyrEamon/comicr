<template>
  <div class="app-shell" :class="{ fullscreen }">
    <MobileTopBar v-if="!fullscreen" :title="title" @menu="openMenu" @search="handleSearch" />
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
        />
      </div>
    </Transition>
    <main class="app-content" :class="{ 'with-bottom-nav': showBottomNav }">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav" />

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
import { BookOpen, Cloud, Compass, Download, Settings, X } from 'lucide-vue-next'
import MobileBottomNav from './MobileBottomNav.vue'
import MobileTopBar from './MobileTopBar.vue'

const route = useRoute()
const menuOpen = ref(false)
const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const fullscreen = computed(() => Boolean(route.meta.fullscreen))
const showBottomNav = computed(() => !fullscreen.value && !route.meta.hideBottomNav)
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
  searchOpen.value = false
  searchQuery.value = ''
  emitSearch()
})

async function handleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false
    searchQuery.value = ''
    emitSearch()
    return
  }

  searchOpen.value = true
  await nextTick()
  searchInput.value?.focus()
  emitSearch()
}

function openMenu() {
  searchOpen.value = false
  menuOpen.value = true
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
