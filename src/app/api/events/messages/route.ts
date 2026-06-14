// src/app/api/events/messages/route.ts
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { validateAuth } from '@/lib/auth'

interface EventItem {
  id: string
  timestamp: number
  type: 'message' | 'request' | 'notice'
  direction: 'incoming' | 'outgoing'
  // Message fields
  userId?: number
  nickname?: string
  card?: string
  groupId?: number | null
  groupName?: string
  content?: string
  rawMessage?: string
  // Request fields
  requestType?: string
  flag?: string
  comment?: string
  // Notice fields
  noticeType?: string
  subType?: string
}

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  const allLogs = logger.getLogs({ type: 'event', limit: 2000 })

  const items: EventItem[] = []

  for (const entry of allLogs) {
    const data = entry.data as Record<string, unknown>
    const postType = data.post_type as string

    if (postType === 'message') {
      // Message events
      const sender = data.sender as Record<string, unknown> | undefined
      const userId = data.user_id as number
      const message = data.message as Array<Record<string, unknown>> | undefined
      const rawMessage = data.raw_message as string || ''
      const direction = entry.direction || 'incoming'

      if (!userId || userId === 0) continue

      let textContent = rawMessage
      if (message && Array.isArray(message)) {
        textContent = message
          .filter((m) => m.type === 'text')
          .map((m) => (m.data as Record<string, unknown>)?.text as string)
          .join('') || rawMessage
      }

      items.push({
        id: entry.id,
        timestamp: entry.timestamp,
        type: 'message',
        direction,
        userId,
        nickname: direction === 'incoming' ? ((sender?.nickname as string) || `User ${userId}`) : '我',
        card: direction === 'incoming' ? ((sender?.card as string) || '') : '',
        groupId: (data.group_id as number) || null,
        groupName: (data.group_name as string) || '',
        content: textContent,
        rawMessage,
      })
    } else if (postType === 'request') {
      // Request events (friend request, group request, etc.)
      const requestType = data.request_type as string
      const userId = data.user_id as number
      const sender = data.sender as Record<string, unknown> | undefined

      items.push({
        id: entry.id,
        timestamp: entry.timestamp,
        type: 'request',
        direction: 'incoming',
        userId,
        nickname: (sender?.nickname as string) || `User ${userId}`,
        card: '',
        groupId: (data.group_id as number) || null,
        groupName: '',
        requestType,
        flag: data.flag as string,
        comment: (data.comment as string) || '',
        content: requestType === 'friend'
          ? `请求添加好友: ${data.comment || '无验证信息'}`
          : requestType === 'group'
            ? `请求加入群 ${data.group_id}: ${data.comment || '无验证信息'}`
            : `请求: ${requestType}`,
      })
    } else if (postType === 'notice') {
      // Notice events (group member changes, etc.)
      const noticeType = data.notice_type as string
      const userId = data.user_id as number || data.operator_id as number

      let content = noticeType
      if (noticeType === 'group_increase') {
        content = `群成员增加: ${data.user_id}`
      } else if (noticeType === 'group_decrease') {
        content = `群成员减少: ${data.user_id}`
      } else if (noticeType === 'group_admin') {
        content = `管理员${data.sub_type === 'set' ? '设置' : '取消'}: ${data.user_id}`
      } else if (noticeType === 'group_ban') {
        const duration = data.duration as number
        content = duration ? `禁言 ${data.user_id} ${duration}秒` : `解除禁言 ${data.user_id}`
      } else if (noticeType === 'friend_add') {
        content = `好友添加: ${data.user_id}`
      } else if (noticeType === 'group_recall') {
        content = `群消息撤回: ${data.operator_id} 撤回了消息`
      } else if (noticeType === 'friend_recall') {
        content = `好友消息撤回: ${data.user_id}`
      } else if (noticeType === 'notify') {
        const subType = data.sub_type as string
        if (subType === 'poke') {
          content = `${data.sender_id} 戳了戳 ${data.target_id}`
        } else if (subType === 'input_status') {
          content = `${data.user_id} 正在输入...`
        }
      }

      items.push({
        id: entry.id,
        timestamp: entry.timestamp,
        type: 'notice',
        direction: 'incoming',
        userId,
        nickname: '',
        groupId: (data.group_id as number) || null,
        groupName: '',
        noticeType,
        subType: data.sub_type as string,
        content,
      })
    }
  }

  // Sort by timestamp descending
  items.sort((a, b) => b.timestamp - a.timestamp)

  return NextResponse.json({ success: true, data: items })
}
