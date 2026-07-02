import { NextResponse } from 'next/server'
import { validateAuth } from '@/lib/auth'
import { saveCredentials, getCredentials } from '@/lib/school/credentials'
import { getDefaultSchool, getAdapter } from '@/lib/school/adapters'

export async function GET() {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const school = getDefaultSchool()
    const adapter = getAdapter(school)

    // Web 端是管理员操作，使用 'admin' 作为 userId
    const userId = 'admin'
    const creds = getCredentials(userId, school)

    return NextResponse.json({
      success: true,
      data: {
        school,
        schoolName: adapter?.displayName || school,
        username: creds?.username || '',
        password: creds ? '****' : '',
        hasCredentials: !!creds,
      },
    })
  } catch (error) {
    console.error('[API] Error fetching credentials:', error)
    return NextResponse.json({ success: false, message: 'Failed to fetch credentials' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await validateAuth())) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { school: schoolInput, username, password } = body

    if (!username || !password) {
      return NextResponse.json({ success: false, message: '账号和密码不能为空' }, { status: 400 })
    }

    const school = schoolInput || getDefaultSchool()
    const userId = 'admin'
    saveCredentials(userId, school, username, password)

    return NextResponse.json({ success: true, message: '凭据已保存' })
  } catch (error) {
    console.error('[API] Error saving credentials:', error)
    return NextResponse.json({ success: false, message: 'Failed to save credentials' }, { status: 500 })
  }
}
