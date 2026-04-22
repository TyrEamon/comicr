<template>
  <div class="page">
    <p class="label-caps">设置</p>
    <h1 class="page-title">设置</h1>
    <p class="page-subtitle">核心阅读闭环稳定之后，这里会放一些真正需要的控制项。</p>

    <section class="surface-card setting-card">
      <div>
        <h2>打包方式</h2>
        <p>APK 由 GitHub Actions 构建，本机不需要安装 Android Studio 或 Android SDK。</p>
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
