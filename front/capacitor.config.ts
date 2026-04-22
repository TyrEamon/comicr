import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tyr.comicsapp',
  appName: 'Comics App',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#0f0f0f',
  },
}

export default config

