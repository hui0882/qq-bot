// src/app/api/events/messages/route.ts
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { validateAuth } from '@/lib/auth'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  // Get all message events from the buffer
  const allLogs = logger.getLogs({ type: 'event', limit: 2000 })
  const messageEvents = allLogs.filter((l) => l.action === 'message')

  // Group by user
  const userMap = new Map<number, {
    userId: number
    nickname: string
    card: string
    groupId: number | null
    groupName: string
    messages: Array<{
      id: string
      timestamp: number
      content: string
      rawMessage: string
      messageType: string
      groupId: number | null
    }>
    lastMessage: string
    lastTimestamp: number
    count: number
  }>()

  for (const entry of messageEvents) {
    const data = entry.data as Record<string, unknown>
    const sender = data.sender as Record<string, unknown> | undefined
    const userId = data.user_id as number
    const message = data.message as Array<Record<string, unknown>> | undefined
    const rawMessage = data.raw_message as string || ''

    if (!userId) continue

    // Extract text content from message segments
    let textContent = rawMessage
    if (message && Array.isArray(message)) {
      textContent = message
        .filter((m) => m.type === 'text')
        .map((m) => (m.data as Record<string, unknown>)?.text as string)
        .join('') || rawMessage
    }

    const existing = userMap.get(userId)
    const groupId = data.group_id as number | null || null
    const nickname = (sender?.nickname as string) || `User ${userId}`
    const card = (sender?.card as string) || ''
    const groupName = (data.group_name as string) || ''

    if (existing) {
      existing.messages.push({
        id: entry.id,
        timestamp: entry.timestamp,
        content: textContent,
        rawMessage,
        messageType: data.message_type as string || 'unknown',
        groupId,
      })
      if (entry.timestamp > existing.lastTimestamp) {
        existing.lastMessage = textContent
        existing.lastTimestamp = entry.timestamp
        existing.nickname = nickname
        existing.card = card
      }
      existing.count++
    } else {
      userMap.set(userId, {
        userId,
        nickname,
        card,
        groupId,
        groupName,
        messages: [{
          id: entry.id,
          timestamp: entry.timestamp,
          content: textContent,
          rawMessage,
          messageType: data.message_type as string || 'unknown',
          groupId,
        }],
        lastMessage: textContent,
        lastTimestamp: entry.timestamp,
        count: 1,
      })
    }
  }

  // Convert to array, sorted by latest message
  const users = Array.from(userMap.values()).sort((a, b) => b.lastTimestamp - a.lastTimestamp)

  return NextResponse.json({ success: true, data: users })
}
