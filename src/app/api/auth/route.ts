// src/app/api/auth/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { configManager } from '@/lib/config'
import { setAuthCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body as { token: string }

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 })
    }

    if (!configManager.validateToken(token)) {
      return NextResponse.json({ success: false, message: 'Token incorrect' }, { status: 401 })
    }

    await setAuthCookie(token)
    return NextResponse.json({ success: true, message: 'Login successful' })
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
