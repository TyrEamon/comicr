<template>
  <button class="icon-button" :class="{ active }" :aria-label="label" :disabled="disabled" type="button">
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
  disabled?: boolean
}>()
</script>
