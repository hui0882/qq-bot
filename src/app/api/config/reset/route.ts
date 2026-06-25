// src/app/api/config/reset/route.ts
import { NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { validateAuth } from '@/lib/auth'

export async function POST() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const config = configManager.resetConfig()
    return NextResponse.json({ success: true, data: config, message: 'Config reset to defaults' })
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to reset config' }, { status: 500 })
  }
}
