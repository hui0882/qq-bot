// src/lib/school/types.ts
// 学业助手 — 类型定义

/** 学校适配器的认证会话数据 */
export interface SchoolSession {
  school: string
  [key: string]: unknown
}

/** 作业项 */
export interface HomeworkItem {
  title: string
  courseName: string
  startTime: string
  deadline: string
  remainingText: string
  detail?: string
}

/** 学校适配器接口 */
export interface SchoolAdapter {
  name: string
  displayName: string
  authenticate(username: string, password: string): Promise<SchoolSession | null>
  fetchHomework(session: SchoolSession): Promise<HomeworkItem[]>
}

/** Session 过期错误 */
export class SessionExpiredError extends Error {
  constructor(message = '会话已过期，请重新登录') {
    super(message)
    this.name = 'SessionExpiredError'
  }
}

/** 服务禁用错误 */
export class ServiceDisabledError extends Error {
  constructor(message = '该功能已关闭') {
    super(message)
    this.name = 'ServiceDisabledError'
  }
}
