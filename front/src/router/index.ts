import { createRouter, createWebHistory } from 'vue-router'
import Cloud from '@/views/Cloud/index.vue'
import Download from '@/views/Download/index.vue'
import Library from '@/views/Library/index.vue'
import MangaDetail from '@/views/MangaDetail/index.vue'
import Online from '@/views/Online/index.vue'
import Reader from '@/views/Reader/index.vue'
import Setting from '@/views/Setting/index.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior() {
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'library', component: Library, meta: { title: '书库' } },
    { path: '/online', name: 'online', component: Online, meta: { title: '发现' } },
    { path: '/download', name: 'download', component: Download, meta: { title: '下载' } },
    { path: '/cloud', name: 'cloud', component: Cloud, meta: { title: '云盘' } },
    { path: '/setting', name: 'setting', component: Setting, meta: { title: '设置' } },
    { path: '/manga/:id', name: 'manga-detail', component: MangaDetail, meta: { title: '详情', hideBottomNav: true } },
    { path: '/reader/:id', name: 'reader', component: Reader, meta: { title: '阅读器', fullscreen: true } },
  ],
})

export default router
