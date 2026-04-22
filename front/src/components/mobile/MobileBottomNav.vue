<template>
  <nav class="bottom-nav" aria-label="Primary navigation">
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
  { path: '/', label: 'Library', icon: BookOpen },
  { path: '/online', label: 'Explore', icon: Compass },
  { path: '/download', label: 'Downloads', icon: Download },
  { path: '/cloud', label: 'Cloud', icon: Cloud },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

