import { libraryService } from './libraryService'
import type { DownloadTask } from './types'

const TASKS_KEY = 'comics-app:downloads:v1'
const IMAGE_URL_RE = /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?.*)?$/i

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(TASKS_KEY) || '[]') as DownloadTask[]
  } catch {
    return []
  }
}

function saveTasks(tasks: DownloadTask[]) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks))
}

function setTask(task: DownloadTask) {
  const tasks = loadTasks()
  const index = tasks.findIndex((item) => item.id === task.id)
  if (index >= 0) {
    tasks[index] = task
  } else {
    tasks.unshift(task)
  }
  saveTasks(tasks)
}

function taskId() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function resolveUrl(rawUrl: string, baseUrl: string) {
  try {
    return new URL(rawUrl, baseUrl).toString()
  } catch {
    return ''
  }
}

function extractTitle(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, ' ').trim()
  return title || fallback
}

function extractImageUrls(html: string, pageUrl: string) {
  const urls = new Set<string>()
  const patterns = [
    /<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi,
    /["']([^"']+\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:\?[^"']*)?)["']/gi,
  ]

  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(html)) !== null) {
      const resolved = resolveUrl(match[1] ?? '', pageUrl)
      if (resolved) urls.add(resolved)
    }
  }

  return [...urls].slice(0, 120)
}

async function fetchBlob(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}`)
  }
  return response.blob()
}

function imageNameFromUrl(url: string, index: number) {
  const parsed = new URL(url)
  const rawName = parsed.pathname.split('/').pop() || `${index + 1}.jpg`
  return rawName.includes('.') ? rawName : `${rawName}.jpg`
}

export const downloadService = {
  listTasks() {
    return loadTasks().sort((left, right) => right.updatedAt - left.updatedAt)
  },

  activeTasks() {
    return this.listTasks().filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status))
  },

  completedTasks() {
    return this.listTasks().filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
  },

  async start(url: string) {
    const trimmed = url.trim()
    if (!trimmed) {
      throw new Error('请输入下载链接')
    }

    const now = Date.now()
    const task: DownloadTask = {
      id: taskId(),
      url: trimmed,
      name: '准备下载',
      status: 'pending',
      current: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
    }

    setTask(task)
    void this.run(task)
    return task
  },

  cancel(taskIdValue: string) {
    const task = loadTasks().find((item) => item.id === taskIdValue)
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) {
      return
    }
    setTask({ ...task, status: 'cancelled', updatedAt: Date.now(), completedAt: Date.now() })
  },

  async run(task: DownloadTask) {
    try {
      setTask({ ...task, status: 'parsing', name: '正在解析链接', updatedAt: Date.now() })

      const pageUrl = new URL(task.url).toString()
      let title = new URL(pageUrl).hostname
      let imageUrls: string[] = []

      if (IMAGE_URL_RE.test(pageUrl)) {
        imageUrls = [pageUrl]
        title = imageNameFromUrl(pageUrl, 0).replace(/\.[^.]+$/, '')
      } else {
        const response = await fetch(pageUrl)
        if (!response.ok) {
          throw new Error(`页面请求失败 ${response.status}`)
        }
        const html = await response.text()
        title = extractTitle(html, title)
        imageUrls = extractImageUrls(html, pageUrl)
      }

      if (imageUrls.length === 0) {
        throw new Error('没有解析到图片链接')
      }

      let currentTask = { ...task, name: title, status: 'downloading' as const, total: imageUrls.length, updatedAt: Date.now() }
      setTask(currentTask)

      const images: Array<{ name: string; type?: string; blob: Blob }> = []
      for (const [index, imageUrl] of imageUrls.entries()) {
        const latest = loadTasks().find((item) => item.id === task.id)
        if (latest?.status === 'cancelled') {
          return
        }

        try {
          const blob = await fetchBlob(imageUrl)
          images.push({
            name: imageNameFromUrl(imageUrl, index),
            type: blob.type,
            blob,
          })
        } catch (error) {
          console.warn(`跳过下载失败的图片: ${imageUrl}`, error)
        }

        currentTask = { ...currentTask, current: index + 1, updatedAt: Date.now() }
        setTask(currentTask)
      }

      if (images.length === 0) {
        throw new Error('图片下载失败')
      }

      const manga = await libraryService.importImageBlobs(title, images, 'download')
      setTask({
        ...currentTask,
        status: 'completed',
        mangaId: manga.id,
        current: images.length,
        total: images.length,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (error) {
      setTask({
        ...task,
        status: 'failed',
        error: error instanceof Error ? error.message : '下载失败',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  },
}
