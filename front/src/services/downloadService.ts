import { libraryService } from './libraryService'
import { downloadTargetService } from './downloadTargetService'
import { cloudDownloadService } from './cloudDownloadService'
import { jmComicService } from './jmComicService'
import type { DownloadTask } from './types'

const TASKS_KEY = 'comics-app:downloads:v1'
const IMAGE_URL_RE = /\.(jpg|jpeg|png|webp|gif|bmp|avif)(\?.*)?$/i
const ACTIVE_STATUSES = new Set(['pending', 'parsing', 'downloading'])
let queueRunning = false

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

function normalizePath(path: string) {
  const segments = path.split('/').map((segment) => segment.trim()).filter(Boolean)
  return segments.length > 0 ? `/${segments.join('/')}` : ''
}

function isActiveTask(task: DownloadTask) {
  return ACTIVE_STATUSES.has(task.status)
}

function nextQueuedTask() {
  return loadTasks()
    .filter((task) => task.status === 'pending')
    .sort((left, right) => left.createdAt - right.createdAt)[0]
}

function isTaskCancelled(taskIdValue: string) {
  return loadTasks().find((item) => item.id === taskIdValue)?.status === 'cancelled'
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
    return this.listTasks().filter(isActiveTask)
  },

  completedTasks() {
    return this.listTasks().filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
  },

  clearCompletedRecords() {
    const tasks = loadTasks()
    const nextTasks = tasks.filter((task) => !['completed', 'failed', 'cancelled'].includes(task.status))
    saveTasks(nextTasks)
    return tasks.length - nextTasks.length
  },

  removeRecord(taskIdValue: string) {
    const tasks = loadTasks()
    const task = tasks.find((item) => item.id === taskIdValue)
    if (!task || isActiveTask(task)) return false

    saveTasks(tasks.filter((item) => item.id !== taskIdValue))
    return true
  },

  retryTask(taskIdValue: string) {
    const task = loadTasks().find((item) => item.id === taskIdValue)
    if (!task || isActiveTask(task)) return null
    if (task.source === 'jm' && !jmComicService.isAvailable()) {
      throw new Error('JM 下载需要 Android APK 环境')
    }

    const now = Date.now()
    const retryTask: DownloadTask = {
      ...task,
      status: 'pending',
      error: undefined,
      phase: undefined,
      outputPath: undefined,
      mangaId: undefined,
      current: 0,
      total: 0,
      createdAt: now,
      completedAt: undefined,
      updatedAt: now,
    }
    setTask(retryTask)
    this.processQueue()
    return retryTask
  },

  async start(url: string) {
    const trimmed = url.trim()
    if (!trimmed) {
      throw new Error('请输入下载链接')
    }
    const isJm = jmComicService.isJmTarget(trimmed)
    if (isJm && !jmComicService.isAvailable()) {
      throw new Error('JM 下载需要 Android APK 环境')
    }

    const now = Date.now()
    const task: DownloadTask = {
      id: taskId(),
      url: trimmed,
      name: isJm ? '准备下载 JM 漫画' : '准备下载',
      source: isJm ? 'jm' : 'link',
      status: 'pending',
      current: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
    }

    setTask(task)
    this.processQueue()
    return task
  },

  async startWebDav(path: string, title?: string) {
    const normalizedPath = normalizePath(path)
    if (!normalizedPath) {
      throw new Error('WebDAV 路径为空')
    }

    const existingTask = this.findActiveWebDavTask(normalizedPath)
    if (existingTask) return existingTask

    const now = Date.now()
    const task: DownloadTask = {
      id: taskId(),
      url: `webdav:${normalizedPath}`,
      name: title?.trim() || '准备下载云盘漫画',
      source: 'webdav',
      remotePath: normalizedPath,
      status: 'pending',
      current: 0,
      total: 0,
      createdAt: now,
      updatedAt: now,
    }

    setTask(task)
    this.processQueue()
    return task
  },

  findActiveWebDavTask(path: string) {
    const normalizedPath = normalizePath(path)
    return this.listTasks().find((task) => (
      task.source === 'webdav'
      && normalizePath(task.remotePath || task.url.replace(/^webdav:/, '')) === normalizedPath
      && isActiveTask(task)
    ))
  },

  cancel(taskIdValue: string) {
    const task = loadTasks().find((item) => item.id === taskIdValue)
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) {
      return
    }
    if (task.source === 'jm') {
      void jmComicService.cancel(task.id)
    }
    setTask({ ...task, status: 'cancelled', updatedAt: Date.now(), completedAt: Date.now() })
  },

  async run(task: DownloadTask) {
    if (task.source === 'webdav') {
      await this.runWebDav(task)
      return
    }
    if (task.source === 'jm') {
      await this.runJm(task)
      return
    }

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
      const imageRefs: Array<{ name: string; type?: string; uri: string }> = []
      let outputPath = downloadTargetService.getTargetLabel()
      for (const [index, imageUrl] of imageUrls.entries()) {
        const latest = loadTasks().find((item) => item.id === task.id)
        if (latest?.status === 'cancelled') {
          return
        }

        try {
          const blob = await fetchBlob(imageUrl)
          const name = imageNameFromUrl(imageUrl, index)
          if (downloadTargetService.isAvailable()) {
            const writtenImage = await downloadTargetService.writeImage(title, name, blob.type, blob)
            outputPath = writtenImage.folderUri || outputPath
            imageRefs.push({
              name: writtenImage.name || name,
              type: writtenImage.type || blob.type,
              uri: writtenImage.uri,
            })
          } else {
            images.push({
              name,
              type: blob.type,
              blob,
            })
          }
        } catch (error) {
          console.warn(`跳过下载失败的图片: ${imageUrl}`, error)
        }

        currentTask = { ...currentTask, current: index + 1, outputPath, updatedAt: Date.now() }
        setTask(currentTask)
      }

      if (images.length === 0 && imageRefs.length === 0) {
        throw new Error('图片下载失败')
      }

      const manga = imageRefs.length > 0
        ? await libraryService.importImageRefs(title, imageRefs, 'download')
        : await libraryService.importImageBlobs(title, images, 'download')
      setTask({
        ...currentTask,
        status: 'completed',
        mangaId: manga.id,
        outputPath,
        current: imageRefs.length || images.length,
        total: imageRefs.length || images.length,
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

  async runJm(task: DownloadTask) {
    let currentTask: DownloadTask = {
      ...task,
      source: 'jm',
      status: 'parsing',
      name: '正在解析 JM 漫画',
      phase: '解析 JM 漫画',
      updatedAt: Date.now(),
    }
    setTask(currentTask)

    const listener = await jmComicService.onProgress((progress) => {
      if (progress.taskId !== task.id || isTaskCancelled(task.id)) return

      currentTask = {
        ...currentTask,
        name: progress.title || currentTask.name,
        status: 'downloading',
        phase: progress.phase || progress.message || '下载 JM 图片',
        current: progress.current,
        total: progress.total,
        updatedAt: Date.now(),
      }
      setTask(currentTask)
    })

    try {
      const result = await jmComicService.download(task.id, task.url)
      if (isTaskCancelled(task.id)) return

      const manga = await libraryService.importImageRefs(result.title, result.images, 'download')
      setTask({
        ...currentTask,
        name: manga.title,
        status: 'completed',
        mangaId: manga.id,
        outputPath: result.outputPath,
        current: manga.imageCount,
        total: manga.imageCount,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (error) {
      if (isTaskCancelled(task.id)) return

      setTask({
        ...currentTask,
        status: 'failed',
        error: error instanceof Error ? error.message : 'JM 下载失败',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    } finally {
      await listener.remove()
    }
  },

  async runWebDav(task: DownloadTask) {
    const remotePath = normalizePath(task.remotePath || task.url.replace(/^webdav:/, ''))
    let currentTask: DownloadTask = {
      ...task,
      remotePath,
      source: 'webdav',
      status: 'parsing',
      updatedAt: Date.now(),
    }
    setTask(currentTask)

    try {
      const result = await cloudDownloadService.downloadWebDavManga(
        remotePath,
        (progress) => {
          currentTask = {
            ...currentTask,
            name: progress.title,
            status: 'downloading',
            current: progress.current,
            total: progress.total,
            updatedAt: Date.now(),
          }
          setTask(currentTask)
        },
        {
          shouldCancel: () => isTaskCancelled(task.id),
        },
      )

      if (isTaskCancelled(task.id)) return

      setTask({
        ...currentTask,
        name: result.manga.title,
        status: 'completed',
        mangaId: result.manga.id,
        outputPath: result.outputPath,
        current: result.manga.imageCount,
        total: result.manga.imageCount,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    } catch (error) {
      if (isTaskCancelled(task.id)) return

      setTask({
        ...currentTask,
        status: 'failed',
        error: error instanceof Error ? error.message : '下载失败',
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  },

  processQueue() {
    if (queueRunning) return
    queueRunning = true

    void (async () => {
      try {
        let task = nextQueuedTask()
        while (task) {
          await this.run(task)
          task = nextQueuedTask()
        }
      } finally {
        queueRunning = false
      }
    })()
  },
}
