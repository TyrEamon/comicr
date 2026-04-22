<template>
  <header class="top-bar">
    <button class="top-icon" type="button" aria-label="Menu">
      <Menu :size="24" />
    </button>

    <div class="top-title">
      <span class="brand">ZenReader</span>
      <span class="section">{{ title }}</span>
    </div>

    <button class="top-icon" type="button" aria-label="Search">
      <Search :size="24" />
    </button>
  </header>
</template>

<script setup lang="ts">
import { Menu, Search } from 'lucide-vue-next'

defineProps<{
  title: string
}>()
</script>

