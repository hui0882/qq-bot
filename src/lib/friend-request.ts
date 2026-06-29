// src/lib/friend-request.ts
// Auto or manual friend request handling

import { napcatWS } from './napcat-ws'
import { configManager } from './config'
import { logger } from './logger'
import { aiContext } from './db/queries/ai'

export interface PendingFriendRequest {
  flag: string
  userId: number
  nickname: string
  comment: string
  timestamp: number
  source: string
}

// In-memory store for pending requests (manual mode)
const pendingRequests: PendingFriendRequest[] = []

export function getPendingRequests(): PendingFriendRequest[] {
  return [...pendingRequests]
}

export function removePendingRequest(flag: string): void {
  const idx = pendingRequests.findIndex((r) => r.flag === flag)
  if (idx >= 0) pendingRequests.splice(idx, 1)
}

export async function handleFriendRequestEvent(event: Record<string, unknown>): Promise<void> {
  const postType = event.post_type as string
  const requestType = event.request_type as string
  if (postType !== 'request' || requestType !== 'friend') return

  const flag = event.flag as string
  const userId = event.user_id as number
  const comment = (event.comment as string) || ''
  const nickname = (event.sender as Record<string, unknown>)?.nickname as string || `User ${userId}`

  if (!flag) return

  const config = configManager.getConfig()
  const mode = config.friendRequest?.mode || 'auto'

  logger.logSystem('FriendRequest: received', { userId, nickname, comment, mode })

  if (mode === 'auto') {
    // Auto-approve
    const result = await napcatWS.sendAction('set_friend_add_request', {
      flag,
      approve: true,
      remark: nickname,
    })
    if (result.status === 'ok') {
      logger.logSystem('FriendRequest: auto-approved', { userId, nickname })
    } else {
      logger.logSystem('FriendRequest: auto-approve failed', { error: result.message })
    }
  } else {
    // Manual mode - store for later
    pendingRequests.push({
      flag,
      userId,
      nickname,
      comment,
      timestamp: Date.now(),
      source: 'friend_request',
    })
    logger.logSystem('FriendRequest: pending (manual mode)', { userId, nickname })
  }
}

export async function approveFriendRequest(flag: string, remark?: string): Promise<{ success: boolean; message?: string }> {
  const result = await napcatWS.sendAction('set_friend_add_request', {
    flag,
    approve: true,
    ...(remark ? { remark } : {}),
  })
  if (result.status === 'ok') {
    removePendingRequest(flag)
    logger.logSystem('FriendRequest: approved', { flag })
    return { success: true }
  }
  return { success: false, message: result.message }
}

export async function rejectFriendRequest(flag: string): Promise<{ success: boolean; message?: string }> {
  const result = await napcatWS.sendAction('set_friend_add_request', {
    flag,
    approve: false,
  })
  if (result.status === 'ok') {
    removePendingRequest(flag)
    logger.logSystem('FriendRequest: rejected', { flag })
    return { success: true }
  }
  return { success: false, message: result.message }
}

/**
 * 处理好友添加成功的通知事件
 * 发送欢迎消息并记录到 AI 上下文
 */
export async function handleFriendAddNotice(event: Record<string, unknown>): Promise<void> {
  const postType = event.post_type as string
  const noticeType = event.notice_type as string
  if (postType !== 'notice' || noticeType !== 'friend_add') return

  const userId = event.user_id as number
  if (!userId) return

  const config = configManager.getConfig()
  const welcomeMessage = config.friendRequest?.welcomeMessage

  if (!welcomeMessage || welcomeMessage.trim().length === 0) {
    logger.logSystem('WelcomeMessage: skipped (not configured)', { userId })
    return
  }

  logger.logSystem('WelcomeMessage: sending', { userId, message: welcomeMessage.slice(0, 50) })

  // 发送欢迎消息
  const result = await napcatWS.sendAction('send_msg', {
    message_type: 'private',
    user_id: String(userId),
    message: [{ type: 'text', data: { text: welcomeMessage } }],
  })

  if (result.status === 'ok') {
    logger.logSystem('WelcomeMessage: sent', { userId })

    // 记录到 AI 上下文（作为 assistant 消息，不需要用户消息）
    try {
      aiContext.saveContext(userId, '[好友添加]', welcomeMessage)
      logger.logSystem('WelcomeMessage: saved to context', { userId })
    } catch (err) {
      logger.logSystem('WelcomeMessage: save context failed', { error: (err as Error).message })
    }
  } else {
    logger.logSystem('WelcomeMessage: send failed', { error: result.message })
  }
}
