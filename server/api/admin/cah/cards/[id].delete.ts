import { requireAdmin, createUserClient } from '../../../../utils/supabaseServer'

// DELETE /api/admin/cah/cards/:id
export default defineEventHandler(async (event) => {
  const jwt = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing card id' })

  const supabase = createUserClient(jwt)
  if (!supabase) throw createError({ statusCode: 503, statusMessage: 'DB not configured' })

  const { error } = await supabase.from('cah_cards').delete().eq('id', id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { ok: true }
})
