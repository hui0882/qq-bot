// src/lib/friend-request.ts
// Auto or manual friend request handling

import { napcatApi } from './napcat-api'
import { configManager } from './config'
import { logger } from './logger'

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
    const result = await napcatApi.sendAction('set_friend_add_request', {
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
  const result = await napcatApi.sendAction('set_friend_add_request', {
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
  const result = await napcatApi.sendAction('set_friend_add_request', {
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
