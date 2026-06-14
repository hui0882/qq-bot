// src/app/api/user-configs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { exportUserConfigs, importUserConfigs } from '@/lib/user-config'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true, data: exportUserConfigs() })
}

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    importUserConfigs(body)
    return NextResponse.json({ success: true, message: 'User configs imported' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
