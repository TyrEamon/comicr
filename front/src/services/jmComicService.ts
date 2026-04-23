import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { downloadTargetService } from './downloadTargetService'
import { jmThreadSettings } from './jmThreadSettings'

export interface JmDownloadProgress {
  taskId: string
  current: number
  total: number
  title: string
  phase?: string
  message: string
}

export interface JmDownloadedImage {
  uri: string
  name: string
  type: string
}

export interface JmDownloadResult {
  title: string
  outputPath: string
  images: JmDownloadedImage[]
}

interface NativeJmComicPlugin {
  probe(): Promise<{ available: boolean; version: string }>
  download(options: {
    taskId: string
    target: string
    targetUri?: string
    threadCount: number
  }): Promise<JmDownloadResult>
  cancel(options: { taskId: string }): Promise<{ cancelled: boolean }>
  addListener(
    eventName: 'jmDownloadProgress',
    listenerFunc: (progress: JmDownloadProgress) => void,
  ): Promise<PluginListenerHandle>
}

const jmComicPlugin = registerPlugin<NativeJmComicPlugin>('JmComic')
const JM_TARGET_RE = /(^\d{3,}$)|(^p\d{3,}$)|(^jm:)|18comic\.(vip|org)|jmcomic/i

export const jmComicService = {
  isAvailable() {
    return Capacitor.getPlatform() === 'android'
  },

  isJmTarget(value: string) {
    return JM_TARGET_RE.test(value.trim())
  },

  probe() {
    return jmComicPlugin.probe()
  },

  download(taskId: string, target: string) {
    const downloadTarget = downloadTargetService.getTarget()
    return jmComicPlugin.download({
      taskId,
      target: normalizeTarget(target),
      targetUri: downloadTarget?.uri,
      threadCount: jmThreadSettings.getSettings().threadCount,
    })
  },

  cancel(taskId: string) {
    return jmComicPlugin.cancel({ taskId })
  },

  onProgress(listener: (progress: JmDownloadProgress) => void) {
    return jmComicPlugin.addListener('jmDownloadProgress', listener)
  },
}

function normalizeTarget(value: string) {
  const target = value.trim()
  return target.toLowerCase().startsWith('jm:') ? target.slice(3).trim() : target
}
