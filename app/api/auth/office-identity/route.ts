import { NextResponse } from 'next/server';

// Phase 6 stub.
// Phase 7: validate Office SSO JWT (using jose + Microsoft JWKS), match/create
// Supabase user, set session cookies.

export async function POST() {
  return NextResponse.json(
    { error: 'Office SSO bridging is not yet implemented. Use dialog auth.' },
    { status: 501 },
  );
}
