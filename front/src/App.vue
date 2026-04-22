<template>
  <MobileShell>
    <RouterView v-slot="{ Component, route }">
      <Transition name="app-page" mode="out-in" appear>
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </RouterView>
  </MobileShell>
</template>

<script setup lang="ts">
import MobileShell from '@/components/mobile/MobileShell.vue'
</script>
