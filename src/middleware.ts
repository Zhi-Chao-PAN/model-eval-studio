/**
 * Global security headers middleware.
 *
 * Applies baseline security headers to ALL responses (pages + API + static).
 * Route-specific hardening (e.g. download-route CSP sandbox, per-route
 * nosniff overrides) continues to live in those handlers directly — this
 * middleware is defense-in-depth only and never unsets a stronger header
 * already on the response.
 *
 * We do NOT set a strict Content-Security-Policy here because the app uses
 * Next.js inline bootstrap scripts + Tailwind classes; CSP is applied
 * per-route where we can lock it down (e.g. the artifact download endpoint
 * sets a strict sandboxed CSP).
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const isProd = process.env.NODE_ENV === 'production'

// Restrictive Referrer-Policy: still send the origin on cross-origin navigations
// but strip path/query; same-origin gets full referrer.
const REFERRER_POLICY = 'strict-origin-when-cross-origin'

// Opt out of browser features the app never uses.
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

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // MIME sniffing defense
  setIfAbsent(response, 'X-Content-Type-Options', 'nosniff')

  // Prevent the app from being framed (prevents clickjacking)
  setIfAbsent(response, 'X-Frame-Options', 'DENY')

  // Restrict referrer leakage
  setIfAbsent(response, 'Referrer-Policy', REFERRER_POLICY)

  // Disable browser features the app doesn't use
  setIfAbsent(response, 'Permissions-Policy', PERMISSIONS_POLICY)

  // Prevent search engines from indexing API endpoints. Page routes already
  // render their own meta; this header is harmless for HTML (search engines
  // prefer robots.txt and meta tags over this header for HTML content).
  if (request.nextUrl.pathname.startsWith('/api/')) {
    setIfAbsent(response, 'X-Robots-Tag', 'noindex, nofollow')
  }

  // HSTS: force HTTPS for 1 year with subdomains (production only; HTTP in dev)
  if (isProd) {
    setIfAbsent(
      response,
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
  }

  // Don't allow this page to be opened by cross-origin popups via opener
  setIfAbsent(response, 'Cross-Origin-Opener-Policy', 'same-origin')

  return response
}

// Only run middleware where it matters; skip Next internals and static assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static assets)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public (files in public/ served directly)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
