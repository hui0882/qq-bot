// src/app/api/db-query/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { runAdminQuery, AdminQueryError } from '@/lib/db/queries/admin-query'

export async function POST(request: NextRequest) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }

  const { template, params } = (body ?? {}) as { template?: unknown; params?: unknown }

  if (
    typeof template !== 'string' ||
    template.length === 0 ||
    (params !== undefined &&
      (params === null || typeof params !== 'object' || Array.isArray(params)))
  ) {
    return NextResponse.json({ success: false, message: 'Invalid request' }, { status: 400 })
  }

  try {
    const data = await runAdminQuery(template, (params ?? {}) as Record<string, unknown>)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof AdminQueryError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      )
    }

    console.error('[API] db-query error:', error)
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    )
  }
}
