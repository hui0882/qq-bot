// src/lib/school/adapters/index.ts
// 适配器注册表

import type { SchoolAdapter } from '../types'
import { CSUSTAdapter } from './csust'

const adapters = new Map<string, SchoolAdapter>()

// 注册所有适配器
adapters.set(CSUSTAdapter.name, CSUSTAdapter)

export function getAdapter(school: string): SchoolAdapter | undefined {
  return adapters.get(school)
}

export function listAdapters(): SchoolAdapter[] {
  return Array.from(adapters.values())
}

export function getDefaultSchool(): string {
  return 'csust'
}
