// src/app/api/friend-requests/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { getPendingRequests, approveFriendRequest, rejectFriendRequest } from '@/lib/friend-request'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ success: true, data: getPendingRequests() })
}

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { action, flag, remark } = body as { action: string; flag: string; remark?: string }

    if (!flag) {
      return NextResponse.json({ success: false, message: 'flag is required' }, { status: 400 })
    }

    if (action === 'approve') {
      const result = await approveFriendRequest(flag, remark)
      return NextResponse.json(result)
    } else if (action === 'reject') {
      const result = await rejectFriendRequest(flag)
      return NextResponse.json(result)
    } else {
      return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }
}
