import { createAnonClient } from '../../../utils/supabaseServer'
import { STATIC_PACK_NAMES } from '../../../utils/cahCards'

// GET /api/admin/cah/packs — list all available pack names (static + DB)
export default defineEventHandler(async () => {
  const dbPacks: string[] = []

  try {
    const supabase = createAnonClient()
    if (supabase) {
      const { data } = await supabase
        .from('cah_cards')
        .select('pack')
        .order('pack')
        .limit(10000)

      if (data) {
        const unique = [...new Set(data.map((r: { pack: string }) => r.pack))]
        dbPacks.push(...unique)
      }
    }
  } catch {
    // DB unavailable — return static packs only
  }

  const all = [...new Set([...STATIC_PACK_NAMES, ...dbPacks])]
  return { packs: all }
})
