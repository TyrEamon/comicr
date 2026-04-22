<template>
  <div class="page">
    <p class="label-caps">Settings</p>
    <h1 class="page-title">Settings</h1>
    <p class="page-subtitle">Small, practical controls will live here after the core reading loop is stable.</p>

    <section class="surface-card setting-card">
      <div>
        <h2>Build Route</h2>
        <p>APK builds are handled by GitHub Actions. This app keeps Android tooling out of the local machine.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.setting-card {
  margin-top: 30px;
  padding: 22px;
}

.setting-card h2 {
  margin: 0 0 8px;
  font-weight: 400;
}

.setting-card p {
  margin: 0;
  color: rgba(209, 197, 183, 0.66);
  line-height: 1.7;
}
</style>

