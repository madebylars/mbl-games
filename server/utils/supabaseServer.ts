import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { getHeader, createError } from 'h3'

function getSupabaseConfig(): { url: string; key: string } | null {
  try {
    const rc = useRuntimeConfig()
    const pub = (rc.public as Record<string, any>)
    const auth = pub.mblAuth as Record<string, string> | undefined
    const url = auth?.supabaseUrl ?? pub.supabaseUrl as string | undefined
    const key = auth?.supabaseKey ?? pub.supabaseKey as string | undefined
    if (!url || !key) return null
    return { url, key }
  } catch {
    return null
  }
}

/** Supabase client for anonymous reads (no user auth). Used by the game server. */
export function createAnonClient() {
  const cfg = getSupabaseConfig()
  if (!cfg) return null
  return createClient(cfg.url, cfg.key, { auth: { persistSession: false } })
}

/** Supabase client authenticated as the given user (for admin writes with RLS). */
export function createUserClient(jwt: string) {
  const cfg = getSupabaseConfig()
  if (!cfg) return null
  return createClient(cfg.url, cfg.key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

/**
 * Extracts the Bearer JWT from the Authorization header, verifies it with Supabase,
 * and confirms the user has app_metadata.role === 'admin'.
 * Throws 401/403 H3 errors on failure.
 */
export async function requireAdmin(event: H3Event): Promise<string> {
  const authHeader = getHeader(event, 'authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const cfg = getSupabaseConfig()
  if (!cfg) throw createError({ statusCode: 503, statusMessage: 'Auth not configured' })

  const supabase = createClient(cfg.url, cfg.key, { auth: { persistSession: false } })
  const { data: { user }, error } = await supabase.auth.getUser(jwt)
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const role = (user.app_metadata as Record<string, unknown>)?.role as string | undefined
  if (role !== 'admin') throw createError({ statusCode: 403, statusMessage: 'Forbidden: admin only' })

  return jwt
}
