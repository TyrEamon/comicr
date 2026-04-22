<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink
      v-for="item in items"
      :key="item.path"
      :to="item.path"
      class="nav-item"
      :class="{ active: isActive(item.path) }"
      :aria-label="item.label"
    >
      <component :is="item.icon" :size="24" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup lang="ts">
import { BookOpen, Cloud, Compass, Download } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const route = useRoute()

const items = [
  { path: '/', label: '书库', icon: BookOpen },
  { path: '/online', label: '发现', icon: Compass },
  { path: '/download', label: '下载', icon: Download },
  { path: '/cloud', label: '云盘', icon: Cloud },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>
