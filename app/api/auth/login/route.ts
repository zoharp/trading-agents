import { NextResponse } from 'next/server'

const PASSWORD = process.env.AUTH_PASSWORD ?? '1qa2ws3ed4rf5tg'
const AUTH_SECRET = process.env.AUTH_SECRET ?? 'twodesksession'

export async function POST(req: Request) {
  const { password } = await req.json()

  if (password !== PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('auth_token', AUTH_SECRET, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
