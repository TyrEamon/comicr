<template>
  <div class="page">
    <p class="label-caps">发现</p>
    <h1 class="page-title">在线源</h1>

    <section class="surface-card placeholder">
      <Compass :size="34" />
      <h2>在线源适配稍后接入</h2>
      <p>第一阶段先确认设置页本地导入、阅读和下载在 Android 上跑通。</p>
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
