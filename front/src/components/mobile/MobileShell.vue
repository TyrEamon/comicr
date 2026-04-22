<template>
  <div class="app-shell" :class="{ fullscreen }">
    <MobileTopBar v-if="!fullscreen" :title="title" @menu="menuOpen = true" @search="handleSearch" />
    <main class="app-content" :class="{ 'with-bottom-nav': showBottomNav }">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav" />

    <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, Cloud, Compass, Download, Settings, X } from 'lucide-vue-next'
import MobileBottomNav from './MobileBottomNav.vue'
import MobileTopBar from './MobileTopBar.vue'

const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)
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
})

async function handleSearch() {
  if (route.name !== 'library') {
    await router.push({ name: 'library', query: { focusSearch: '1' } })
  }

  await nextTick()
  window.dispatchEvent(new CustomEvent('focus-library-search'))
}
</script>

<style scoped>
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
</style>
