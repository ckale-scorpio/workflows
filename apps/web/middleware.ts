import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/proxy';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     * Supabase Auth cookies must refresh on every request that could render a page.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
