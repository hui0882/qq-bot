// src/app/api/users/route.ts
import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { getAllUsers } from '@/lib/db/queries/users'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const users = getAllUsers()
    return NextResponse.json({ success: true, data: users })
  } catch (error) {
    console.error('[API] Error fetching users:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
