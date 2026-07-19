import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Полный набор тестов конкурентно нагружает CPU/event loop; тестам
    // ConfigLoader (fs.watch/watchFile под нагрузкой) нужен запас больше
    // дефолтных 5с, иначе они изредка ловят таймаут на busy-машине.
    testTimeout: 10000
  }
})
