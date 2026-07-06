import type { BlockoutAPI } from '../preload/index'

declare global {
  interface Window {
    blockout: BlockoutAPI
  }
}

export {}
