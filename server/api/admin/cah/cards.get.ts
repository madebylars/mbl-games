import { requireAdmin, createAnonClient } from '../../../utils/supabaseServer'

// GET /api/admin/cah/cards?pack=base&type=black
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const supabase = createAnonClient()
  if (!supabase) throw createError({ statusCode: 503, statusMessage: 'DB not configured' })

  let q = supabase.from('cah_cards').select('*').order('pack').order('type').order('created_at').limit(10000)

  if (query.pack) q = q.eq('pack', String(query.pack))
  if (query.type) q = q.eq('type', String(query.type))

  const { data, error } = await q
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return data
})
