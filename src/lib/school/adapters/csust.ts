// src/lib/school/adapters/csust.ts
// CSUST 长沙理工大学适配器 — 移植自 csust_homework_checker.py

import { createHash } from 'crypto'
import type { SchoolAdapter, SchoolSession, HomeworkItem } from '../types'

const BASE_URL = 'http://pt.csust.edu.cn/mobile'

const MOBILE_HEADERS: Record<string, string> = {
  'Accept-Charset': 'UTF-8',
  'Authorization': 'OAuth2: token',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 15; 22127RK46C Build/AQ3A.250226.002)',
  'Connection': 'Keep-Alive',
  'Accept-Encoding': 'gzip',
}

const DEVICE_PARAMS = {
  deviceUuid: 'ecaac38cae77d5f1',
  appVersion: '1.7.9',
  devicePlatform: 'Android',
  deviceVersion: '15',
  deviceName: '22127RK46C',
}

interface CSUSTSession extends SchoolSession {
  school: 'csust'
  cookies: string // JSESSIONID cookie
  realname?: string
}

function encryptPassword(password: string): string {
  return createHash('md5').update(password).digest('hex').toLowerCase()
}

function parseCookies(setCookieHeaders: string[]): string {
  const cookies: string[] = []
  for (const header of setCookieHeaders) {
    const parts = header.split(';')[0]
    if (parts) cookies.push(parts)
  }
  return cookies.join('; ')
}

async function getSessionId(): Promise<{ sessionId: string; cookies: string } | null> {
  try {
    const body = new URLSearchParams(DEVICE_PARAMS as Record<string, string>)
    const resp = await fetch(`${BASE_URL}/getSessionId.do`, {
      method: 'POST',
      headers: MOBILE_HEADERS,
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = (await resp.json()) as { status: number; sessionid?: string }
    if (result.status === 1 && result.sessionid) {
      const setCookies = resp.headers.getSetCookie?.() || []
      const cookies = parseCookies(setCookies) || `JSESSIONID=${result.sessionid}`
      return { sessionId: result.sessionid, cookies }
    }
  } catch {
    /* ignore */
  }
  return null
}

async function login(
  username: string,
  password: string,
  existingCookies: string,
): Promise<{ success: boolean; cookies: string; realname?: string }> {
  const encryptedPwd = encryptPassword(password)
  const body = new URLSearchParams({
    ...DEVICE_PARAMS,
    j_username: username,
    j_password: encryptedPwd,
  })
  try {
    const resp = await fetch(`${BASE_URL}/login_check.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: existingCookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = (await resp.json()) as {
      status: number
      datas?: { userinfo?: { user?: { realname?: string } } }
    }
    if (result.status === 1) {
      const setCookies = resp.headers.getSetCookie?.() || []
      const newCookies = setCookies.length > 0 ? parseCookies(setCookies) : existingCookies
      const realname = result.datas?.userinfo?.user?.realname || username
      return { success: true, cookies: newCookies, realname }
    }
  } catch {
    /* ignore */
  }
  return { success: false, cookies: existingCookies }
}

async function getHomeworkList(cookies: string): Promise<unknown[]> {
  try {
    const body = new URLSearchParams({ context: '' })
    const resp = await fetch(`${BASE_URL}/hw/stu/findStuUnDoHwTaskList.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: cookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = (await resp.json()) as { status: number; datas?: { hwtList?: unknown[] } }
    if (result.status === 1) {
      return result.datas?.hwtList || []
    }
  } catch {
    /* ignore */
  }
  return []
}

async function getHomeworkDetail(
  cookies: string,
  hwtId: number,
  courseId: number,
): Promise<string> {
  try {
    const body = new URLSearchParams({
      hwtId: String(hwtId),
      courseId: String(courseId),
    })
    const resp = await fetch(`${BASE_URL}/hw/stu/hwStuSubmit.do`, {
      method: 'POST',
      headers: { ...MOBILE_HEADERS, Cookie: cookies },
      body,
      signal: AbortSignal.timeout(15000),
    })
    const result = (await resp.json()) as { status: number; datas?: { content?: string } }
    if (result.status === 1 && result.datas?.content) {
      let content = result.datas.content
      content = content.replace(/<[^>]+>/g, '')
      content = content
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/\\\//g, '/')
      content = content.replace(/\s+/g, ' ').trim()
      return content
    }
  } catch {
    /* ignore */
  }
  return ''
}

function calcRemainingDays(deadlineStr: string): string {
  try {
    const deadline = new Date(deadlineStr.replace(' ', 'T'))
    const now = new Date()
    const totalHours = (deadline.getTime() - now.getTime()) / 3600000
    if (totalHours < 0) return '⛔ 已过期'
    if (totalHours < 24) return `🔴 仅剩 ${Math.floor(totalHours)} 小时！！`
    if (totalHours < 72) {
      const days = Math.floor(totalHours / 24)
      const hours = Math.floor(totalHours % 24)
      return `🟠 仅剩 ${days} 天 ${hours} 小时`
    }
    return `🟡 剩余 ${Math.floor(totalHours / 24)} 天`
  } catch {
    return ''
  }
}

function calcRemainingDaysNumeric(deadlineStr: string): number {
  try {
    const deadline = new Date(deadlineStr.replace(' ', 'T'))
    const now = new Date()
    return (deadline.getTime() - now.getTime()) / 86400000
  } catch {
    return 999
  }
}

export const CSUSTAdapter: SchoolAdapter = {
  name: 'csust',
  displayName: '长沙理工大学',

  async authenticate(username: string, password: string): Promise<SchoolSession | null> {
    const sessionResult = await getSessionId()
    if (!sessionResult) return null

    const loginResult = await login(username, password, sessionResult.cookies)
    if (!loginResult.success) return null

    return {
      school: 'csust',
      cookies: loginResult.cookies,
      realname: loginResult.realname,
    } as CSUSTSession
  },

  async fetchHomework(session: SchoolSession): Promise<HomeworkItem[]> {
    const { cookies } = session as CSUSTSession
    const hwList = await getHomeworkList(cookies)

    // 按截止时间排序
    hwList.sort((a: unknown, b: unknown) => {
      const da = (a as Record<string, string>).deadline || '9999-99-99 99:99'
      const db = (b as Record<string, string>).deadline || '9999-99-99 99:99'
      return da.localeCompare(db)
    })

    const items: HomeworkItem[] = []
    for (const hw of hwList) {
      const h = hw as Record<string, unknown>
      const deadline = (h.deadline as string) || ''
      const hwtId = h.id as number
      const courseId = h.courseId as number
      const daysLeft = calcRemainingDaysNumeric(deadline)

      let detail: string | undefined
      if (daysLeft < 3 && hwtId && courseId) {
        detail = await getHomeworkDetail(cookies, hwtId, courseId)
      }

      items.push({
        title: (h.title as string) || '未知作业',
        courseName: (h.courseName as string) || '未知课程',
        startTime: (h.startDateTime as string) || '',
        deadline,
        remainingText: calcRemainingDays(deadline),
        detail: detail || undefined,
      })
    }
    return items
  },
}
