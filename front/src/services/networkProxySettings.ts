const NETWORK_PROXY_SETTINGS_KEY = 'comics-app:network-proxy-settings:v1'

export type NetworkProxyType = 'off' | 'http' | 'socks5'

export interface NetworkProxySettings {
  enabled: boolean
  type: NetworkProxyType
  host: string
  port: number
  username: string
  password: string
  raw: string
}

export interface NativeProxyConfig {
  enabled: boolean
  type: 'http' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

const DEFAULT_SETTINGS: NetworkProxySettings = {
  enabled: false,
  type: 'off',
  host: '',
  port: 0,
  username: '',
  password: '',
  raw: '',
}

function loadJsonRecord<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key)
    return rawValue ? JSON.parse(rawValue) as T : fallback
  } catch {
    return fallback
  }
}

function parsePort(value: string | number | null | undefined) {
  const port = Number(value)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('代理端口需要在 1-65535 之间')
  }
  return Math.round(port)
}

function normalizeSettings(settings?: Partial<NetworkProxySettings>): NetworkProxySettings {
  const source = settings ?? {}
  const type = source.type === 'http' || source.type === 'socks5' ? source.type : 'off'
  if (type === 'off') return { ...DEFAULT_SETTINGS }

  const host = String(source.host || '').trim()
  if (!host) throw new Error('请填写代理地址')

  return {
    enabled: source.enabled ?? true,
    type,
    host,
    port: parsePort(source.port),
    username: String(source.username || '').trim(),
    password: String(source.password || ''),
    raw: String(source.raw || '').trim(),
  }
}

function parseTgSocks(value: string): NetworkProxySettings {
  const url = new URL(value)
  const host = url.searchParams.get('server') || ''
  const port = parsePort(url.searchParams.get('port'))
  const username = url.searchParams.get('user') || url.searchParams.get('username') || ''
  const password = url.searchParams.get('pass') || url.searchParams.get('password') || ''

  return normalizeSettings({
    type: 'socks5',
    host,
    port,
    username,
    password,
    raw: value,
  })
}

function parseUrlProxy(value: string): NetworkProxySettings {
  const url = new URL(value)
  const protocol = url.protocol.replace(':', '').toLowerCase()
  const type: NetworkProxyType = protocol === 'http' || protocol === 'https' ? 'http' : 'socks5'

  return normalizeSettings({
    type,
    host: url.hostname,
    port: parsePort(url.port || (type === 'http' ? 8080 : 1080)),
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    raw: value,
  })
}

export function parseProxyInput(value: string): NetworkProxySettings {
  const trimmed = value.trim()
  if (!trimmed) return { ...DEFAULT_SETTINGS }

  if (/^tg:\/\/socks/i.test(trimmed)) {
    return parseTgSocks(trimmed)
  }

  if (/^(socks5?|http|https):\/\//i.test(trimmed)) {
    return parseUrlProxy(trimmed)
  }

  const match = trimmed.match(/^([^:@\s]+):(\d{1,5})$/)
  if (match) {
    return normalizeSettings({
      type: 'socks5',
      host: match[1],
      port: Number(match[2]),
      raw: trimmed,
    })
  }

  throw new Error('代理格式不支持，请使用 socks5://host:port 或 tg://socks?...')
}

function getSettings(): NetworkProxySettings {
  const settings = loadJsonRecord<Partial<NetworkProxySettings>>(NETWORK_PROXY_SETTINGS_KEY, {})
  try {
    return normalizeSettings(settings)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function setEnabled(enabled: boolean) {
  const settings = {
    ...getSettings(),
    enabled,
  }
  localStorage.setItem(NETWORK_PROXY_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

function getNativeProxy(settings = getSettings()): NativeProxyConfig | undefined {
  if (!settings.enabled || settings.type === 'off') return undefined
  return {
    enabled: true,
    type: settings.type,
    host: settings.host,
    port: settings.port,
    username: settings.username || undefined,
    password: settings.password || undefined,
  }
}

function toInputValue(settings = getSettings()) {
  if (settings.type === 'off') return ''
  return settings.raw || `${settings.type}://${settings.host}:${settings.port}`
}

function describe(settings = getSettings()) {
  if (settings.type === 'off') return '未启用'
  const mode = settings.enabled ? '应用内代理' : '全局网络'
  return `${mode} · ${settings.type.toUpperCase()} ${settings.host}:${settings.port}`
}

export const networkProxySettings = {
  getSettings,

  updateFromInput(value: string) {
    const settings = parseProxyInput(value)
    localStorage.setItem(NETWORK_PROXY_SETTINGS_KEY, JSON.stringify(settings))
    return settings
  },

  setEnabled,

  clear() {
    localStorage.setItem(NETWORK_PROXY_SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS))
    return { ...DEFAULT_SETTINGS }
  },

  getNativeProxy,
  toInputValue,
  describe,
}
