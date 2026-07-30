import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    const logs = db.prepare(`
      SELECT * FROM task_executions
      WHERE task_id = ?
      ORDER BY scheduled_at DESC
      LIMIT ?
    `).all(id, limit)

    return NextResponse.json({
      success: true,
      data: logs,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
