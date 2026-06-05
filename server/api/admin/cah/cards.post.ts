import { customAlphabet } from 'nanoid'
import { requireAdmin, createUserClient } from '../../../utils/supabaseServer'

const genId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)

// POST /api/admin/cah/cards
export default defineEventHandler(async (event) => {
  const jwt = await requireAdmin(event)
  const body = await readBody(event)

  const { pack, type, text, pick } = body ?? {}
  if (!pack || !type || !text) {
    throw createError({ statusCode: 400, statusMessage: 'pack, type, and text are required' })
  }
  if (type !== 'black' && type !== 'white') {
    throw createError({ statusCode: 400, statusMessage: 'type must be "black" or "white"' })
  }
  if (type === 'black' && ![1, 2, 3].includes(Number(pick))) {
    throw createError({ statusCode: 400, statusMessage: 'pick must be 1, 2, or 3 for black cards' })
  }

  const supabase = createUserClient(jwt)
  if (!supabase) throw createError({ statusCode: 503, statusMessage: 'DB not configured' })

  const card = {
    id: genId(),
    pack: String(pack),
    type: String(type),
    text: String(text).trim(),
    pick: type === 'black' ? Number(pick) : 1,
  }

  const { data, error } = await supabase.from('cah_cards').insert(card).select().single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return data
})
