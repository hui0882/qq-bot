import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],

    // 排除目录
    exclude: ['node_modules', '.next', 'data'],

    // 全局设置
    globals: true,

    // 超时设置
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
