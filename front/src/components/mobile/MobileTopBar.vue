<template>
  <header class="top-bar">
    <button class="top-icon" type="button" aria-label="菜单" @click="$emit('menu')">
      <Menu :size="24" />
    </button>

    <div class="top-title">
      <span class="section">{{ title }}</span>
    </div>

    <button class="top-icon" type="button" aria-label="搜索" @click="$emit('search')">
      <Search :size="24" />
    </button>
  </header>
</template>

<script setup lang="ts">
import { Menu, Search } from 'lucide-vue-next'

defineProps<{
  title: string
}>()

defineEmits<{
  menu: []
  search: []
}>()
</script>
