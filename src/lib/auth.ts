// src/lib/auth.ts
import { cookies } from 'next/headers'
import { configManager } from './config'

const TOKEN_COOKIE = 'napcat_token'
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: false, // HTTP 环境下必须为 false
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
}

export async function getAuthToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(TOKEN_COOKIE)?.value
}

export async function validateAuth(): Promise<boolean> {
  const token = await getAuthToken()
  if (!token) return false
  return configManager.validateToken(token)
}

export function validateTokenSync(token: string): boolean {
  return configManager.validateToken(token)
}
