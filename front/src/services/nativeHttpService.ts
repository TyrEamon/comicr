import { Capacitor, registerPlugin } from '@capacitor/core'
import { networkProxySettings, type NativeProxyConfig } from './networkProxySettings'

type ResponseType = 'text' | 'base64' | 'head'

interface NativeHttpRequestOptions {
  url: string
  method?: 'GET' | 'HEAD' | 'POST'
  headers?: Record<string, string>
  body?: string
  responseType?: ResponseType
  proxy?: NativeProxyConfig
}

interface NativeHttpResponse {
  status: number
  data?: string
  base64?: string
  mimeType?: string
  url?: string
}

interface NativeHttpPlugin {
  request(options: NativeHttpRequestOptions): Promise<NativeHttpResponse>
}

const nativeHttpPlugin = registerPlugin<NativeHttpPlugin>('NativeHttp')
const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en,zh-CN;q=0.9,zh;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
}
const FORBIDDEN_BROWSER_HEADERS = new Set(['cookie', 'host', 'origin', 'referer', 'user-agent'])

function isAndroid() {
  return Capacitor.getPlatform() === 'android'
}

function base64ToBlob(base64: string, type: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

function headersWithDefaults(headers?: Record<string, string>) {
  return {
    ...DEFAULT_HEADERS,
    ...(headers ?? {}),
  }
}

function browserHeaders(headers?: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(headersWithDefaults(headers))
      .filter(([key]) => !FORBIDDEN_BROWSER_HEADERS.has(key.toLowerCase())),
  )
}

async function request(options: NativeHttpRequestOptions) {
  if (isAndroid()) {
    const proxy = options.proxy ?? networkProxySettings.getNativeProxy()
    const response = await nativeHttpPlugin.request({
      ...options,
      headers: headersWithDefaults(options.headers),
      ...(proxy ? { proxy } : {}),
    })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`请求失败 ${response.status}`)
    }
    return response
  }

  const response = await fetch(options.url, {
    method: options.method ?? 'GET',
    headers: browserHeaders(options.headers),
    body: options.body,
  })
  if (!response.ok) {
    throw new Error(`请求失败 ${response.status}`)
  }

  if (options.responseType === 'base64') {
    const blob = await response.blob()
    return {
      status: response.status,
      base64: await blobToBase64(blob),
      mimeType: blob.type || response.headers.get('content-type') || 'application/octet-stream',
      url: response.url,
    }
  }

  return {
    status: response.status,
    data: options.method === 'HEAD' ? '' : await response.text(),
    mimeType: response.headers.get('content-type') || 'text/plain',
    url: response.url,
  }
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.includes(',') ? value.split(',')[1] ?? '' : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取响应失败'))
    reader.readAsDataURL(blob)
  })
}

export const nativeHttpService = {
  async getText(url: string, headers?: Record<string, string>) {
    const response = await request({ url, headers, responseType: 'text' })
    return response.data || ''
  },

  async postText(url: string, body: string, headers?: Record<string, string>) {
    const response = await request({
      url,
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(headers ?? {}),
      },
      responseType: 'text',
    })
    return response.data || ''
  },

  async head(url: string, headers?: Record<string, string>) {
    await request({ url, method: 'HEAD', headers, responseType: 'head' })
    return true
  },

  async getBlob(url: string, headers?: Record<string, string>) {
    const response = await request({ url, headers, responseType: 'base64' })
    return base64ToBlob(response.base64 || '', response.mimeType || 'application/octet-stream')
  },
}
