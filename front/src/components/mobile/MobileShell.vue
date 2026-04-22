<template>
  <div class="app-shell" :class="{ fullscreen }">
    <MobileTopBar v-if="!fullscreen" :title="title" />
    <main class="app-content" :class="{ 'with-bottom-nav': showBottomNav }">
      <slot />
    </main>
    <MobileBottomNav v-if="showBottomNav" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import MobileBottomNav from './MobileBottomNav.vue'
import MobileTopBar from './MobileTopBar.vue'

const route = useRoute()
const fullscreen = computed(() => Boolean(route.meta.fullscreen))
const showBottomNav = computed(() => !fullscreen.value && !route.meta.hideBottomNav)
const title = computed(() => String(route.meta.title ?? 'Library'))
</script>

