import { NextResponse } from 'next/server'

// Diagnostic endpoint to check environment variables (remove after debugging)
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const databaseUrl = process.env.DATABASE_URL
  const replicateToken = process.env.REPLICATE_API_TOKEN || process.env.REPLICATE_API_KEY
  
  return NextResponse.json({
    supabase: {
      hasUrl: Boolean(supabaseUrl),
      urlHost: supabaseUrl ? new URL(supabaseUrl).host : null,
      hasAnonKey: Boolean(supabaseAnonKey),
      anonKeyLength: supabaseAnonKey?.length || 0,
    },
    database: {
      hasUrl: Boolean(databaseUrl),
      isPooler: databaseUrl?.includes('pooler.supabase.com') || false,
    },
    replicate: {
      hasToken: Boolean(replicateToken),
      tokenPrefix: replicateToken?.substring(0, 3) || null,
    },
    nodeEnv: process.env.NODE_ENV,
  })
}
