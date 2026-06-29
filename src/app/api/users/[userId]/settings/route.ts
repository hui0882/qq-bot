// src/app/api/users/[userId]/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { getAllUserSettings, getOrCreateUser } from '@/lib/db/queries/users'
import { getUserAIConfig } from '@/lib/db/queries/ai'

interface UserSettingsResponse {
  userId: string
  userInfo: {
    qqId: string
    createdAt: number
    updatedAt: number
  }
  settings: Record<string, string>
  aiConfig: {
    enabled: boolean
    model: string | null
    maxTokens: number
    temperature: number
    maxContextRounds: number
    defaultReplyType: string
    customSystemPrompt: string | null
    baseUrl: string | null
    hasApiKey: boolean
  } | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { userId } = await params

    // 获取或创建用户
    const user = getOrCreateUser(userId)

    // 获取用户所有设置
    const settings = getAllUserSettings(userId)

    // 获取用户 AI 配置
    const aiConfig = getUserAIConfig(userId)

    const response: UserSettingsResponse = {
      userId,
      userInfo: {
        qqId: user.qq_id,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      settings,
      aiConfig: aiConfig ? {
        enabled: Boolean(aiConfig.enabled),
        model: aiConfig.model,
        maxTokens: aiConfig.max_tokens,
        temperature: aiConfig.temperature,
        maxContextRounds: aiConfig.max_context_rounds,
        defaultReplyType: aiConfig.default_reply_type,
        customSystemPrompt: aiConfig.custom_system_prompt,
        baseUrl: aiConfig.base_url,
        hasApiKey: Boolean(aiConfig.api_key),
      } : null,
    }

    return NextResponse.json({ success: true, data: response })
  } catch (error) {
    console.error('[API] Error fetching user settings:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to fetch user settings' },
      { status: 500 }
    )
  }
}
