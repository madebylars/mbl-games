import { requireAdmin, createAnonClient } from '../../../utils/supabaseServer'

// GET /api/admin/cah/cards?pack=base&type=black
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const supabase = createAnonClient()
  if (!supabase) throw createError({ statusCode: 503, statusMessage: 'DB not configured' })

  const allData: any[] = []
  const batchSize = 1000
  let from = 0
  while (true) {
    let q = supabase.from('cah_cards').select('*').order('pack').order('type').order('created_at')
    if (query.pack) q = q.eq('pack', String(query.pack))
    if (query.type) q = q.eq('type', String(query.type))
    const { data, error } = await q.range(from, from + batchSize - 1)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < batchSize) break
    from += batchSize
  }
  return allData
})
