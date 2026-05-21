import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'twodesksession'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value
  if (token !== AUTH_SECRET) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
