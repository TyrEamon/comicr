import { Capacitor, registerPlugin } from '@capacitor/core'

interface ReaderSystemUiPlugin {
  enterImmersive(): Promise<void>
  exitImmersive(): Promise<void>
  getDeviceStatus(): Promise<ReaderDeviceStatus>
}

export interface ReaderDeviceStatus {
  batteryLevel?: number
  isCharging?: boolean
}

const readerSystemUiPlugin = registerPlugin<ReaderSystemUiPlugin>('ReaderSystemUi')

function isAndroid() {
  return Capacitor.getPlatform() === 'android'
}

async function runSafely(action: () => Promise<void>) {
  if (!isAndroid()) return
  try {
    await action()
  } catch {
    // Native system UI is best-effort; the reader should still work if the platform rejects it.
  }
}

async function readSafely<T>(action: () => Promise<T>, fallback: T) {
  if (!isAndroid()) return fallback
  try {
    return await action()
  } catch {
    return fallback
  }
}

export const readerSystemUiService = {
  enterImmersive() {
    return runSafely(() => readerSystemUiPlugin.enterImmersive())
  },

  exitImmersive() {
    return runSafely(() => readerSystemUiPlugin.exitImmersive())
  },

  getDeviceStatus() {
    return readSafely(() => readerSystemUiPlugin.getDeviceStatus(), {})
  },
}
