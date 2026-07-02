import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { getCredentials } from '@/lib/school/credentials'
import { getDefaultSchool, getAdapter } from '@/lib/school/adapters'

export async function POST() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const school = getDefaultSchool()
    const userId = 'admin'
    const creds = getCredentials(userId, school)

    if (!creds) {
      return NextResponse.json({
        success: false,
        message: '请先保存账号密码',
      })
    }

    const adapter = getAdapter(school)
    if (!adapter) {
      return NextResponse.json({
        success: false,
        message: `不支持的学校: ${school}`,
      })
    }

    const session = await adapter.authenticate(creds.username, creds.password)
    if (!session) {
      return NextResponse.json({
        success: false,
        message: '登录失败，请检查账号密码是否正确',
      })
    }

    const realname = (session as Record<string, unknown>).realname as string || creds.username
    return NextResponse.json({
      success: true,
      message: `登录成功，欢迎 ${realname}`,
    })
  } catch (error) {
    console.error('[API] Error testing connection:', error)
    return NextResponse.json({ success: false, message: '连接测试失败' }, { status: 500 })
  }
}
