import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isProd = process.env.NODE_ENV === 'production'
const REFERRER_POLICY = 'strict-origin-when-cross-origin'

const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'document-domain=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
  'web-share=()',
  'xr-spatial-tracking=()',
].join(', ')

function setIfAbsent(res: NextResponse, name: string, value: string) {
  if (!res.headers.has(name)) {
    res.headers.set(name, value)
  }
}

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/share/') &&
    !request.nextUrl.pathname.startsWith('/.well-known/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)
  ) {
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    const host = request.headers.get('host')

    if (isProd && host) {
      const expectedOrigin = (request.headers.get('x-forwarded-proto')?.includes('https') ? 'https' : 'http') + '://' + host
      const originOk = origin === expectedOrigin
      let refererOk = false
      if (referer) {
        try {
          refererOk = new URL(referer).origin === expectedOrigin
        } catch {
          refererOk = false
        }
      }

      if (!originOk && !refererOk) {
        return new NextResponse(
          JSON.stringify({ error: 'CSRF 校验失败：请求来源不合法' }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
    }
  }

  const response = NextResponse.next()

  setIfAbsent(response, 'X-Content-Type-Options', 'nosniff')
  setIfAbsent(response, 'X-Frame-Options', 'DENY')
  setIfAbsent(response, 'Referrer-Policy', REFERRER_POLICY)
  setIfAbsent(response, 'Permissions-Policy', PERMISSIONS_POLICY)

  if (request.nextUrl.pathname.startsWith('/api/')) {
    setIfAbsent(response, 'X-Robots-Tag', 'noindex, nofollow')
  }

  if (isProd) {
    setIfAbsent(
      response,
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
  }

  setIfAbsent(response, 'Cross-Origin-Opener-Policy', 'same-origin')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
