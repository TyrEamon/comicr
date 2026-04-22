<template>
  <div class="page">
    <p class="label-caps">Explore</p>
    <h1 class="page-title">Online Sources</h1>
    <p class="page-subtitle">
      Online source support is intentionally after the local reader and APK build. The service shape is reserved for
      TypeScript ports of the PC crawler logic.
    </p>

    <section class="surface-card placeholder">
      <Compass :size="34" />
      <h2>Source adapters come next</h2>
      <p>First we prove import, reading, downloads, and cloud import on Android.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { Compass } from 'lucide-vue-next'
</script>

<style scoped>
.placeholder {
  display: grid;
  min-height: 260px;
  place-items: center;
  gap: 12px;
  margin-top: 30px;
  padding: 28px;
  color: rgba(209, 197, 183, 0.68);
  text-align: center;
}

.placeholder h2 {
  margin: 0;
  color: var(--color-text);
  font-weight: 400;
}

.placeholder p {
  max-width: 320px;
  margin: 0;
  line-height: 1.7;
}
</style>

