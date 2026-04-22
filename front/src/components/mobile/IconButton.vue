<template>
  <button class="icon-button" :class="{ active }" :aria-label="label" type="button">
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()
</script>

