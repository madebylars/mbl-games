import { requireAdmin, createUserClient } from '../../../../utils/supabaseServer'

// PATCH /api/admin/cah/cards/:id
export default defineEventHandler(async (event) => {
  const jwt = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing card id' })

  const body = await readBody(event)
  const { pack, type, text, pick } = body ?? {}

  if (type && type !== 'black' && type !== 'white') {
    throw createError({ statusCode: 400, statusMessage: 'type must be "black" or "white"' })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (pack !== undefined) updates.pack = String(pack)
  if (type !== undefined) updates.type = String(type)
  if (text !== undefined) updates.text = String(text).trim()
  if (pick !== undefined) updates.pick = Number(pick)

  const supabase = createUserClient(jwt)
  if (!supabase) throw createError({ statusCode: 503, statusMessage: 'DB not configured' })

  const { data, error } = await supabase
    .from('cah_cards')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Card not found' })

  return data
})
