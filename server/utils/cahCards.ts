import type { BlackCard, WhiteCard } from '../../shared/types/cah'

// ── Card pack data ─────────────────────────────────────────────────────────────
//
// Nitro/Rollup bundles the server at build time and cannot resolve dynamic
// template-literal imports (e.g. `import(\`...cah-${name}.json\`)`).
// All packs must be imported as static string literals so the bundler can
// include them. Add new packs here when you create more JSON files.

import basePack from '../../public/cards/cah-base.json'
import swedishPack from '../../public/cards/cah-swedish.json'

interface CardPack {
  pack: string
  black: Array<{ id: string; text: string; pick: number }>
  white: Array<{ id: string; text: string }>
}

// Registry: packName → raw JSON data (static, bundled at build time)
const PACK_REGISTRY: Record<string, CardPack> = {
  base: basePack as CardPack,
  swedish: swedishPack as CardPack,
}

// ── Static pack cache ──────────────────────────────────────────────────────────

const packCache = new Map<string, { black: BlackCard[]; white: WhiteCard[] }>()

function loadStaticPack(packName: string): { black: BlackCard[]; white: WhiteCard[] } {
  if (packCache.has(packName)) return packCache.get(packName)!

  const data = PACK_REGISTRY[packName]
  if (!data) return { black: [], white: [] }

  const parsed = {
    black: data.black.map((c) => ({
      id: c.id,
      text: c.text,
      pick: (c.pick ?? 1) as 1 | 2 | 3,
      pack: packName,
    })),
    white: data.white.map((c) => ({
      id: c.id,
      text: c.text,
      pack: packName,
    })),
  }

  packCache.set(packName, parsed)
  return parsed
}

// ── DB card loading ────────────────────────────────────────────────────────────

interface DbCard {
  id: string
  pack: string
  type: 'black' | 'white'
  text: string
  pick: number
}

async function loadDbCards(packs: string[]): Promise<{ black: BlackCard[]; white: WhiteCard[] }> {
  try {
    const { createAnonClient } = await import('./supabaseServer')
    const supabase = createAnonClient()
    if (!supabase) return { black: [], white: [] }

    const { data, error } = await supabase
      .from('cah_cards')
      .select('id, pack, type, text, pick')
      .in('pack', packs)
      .limit(10000)

    if (error || !data) return { black: [], white: [] }

    const rows = data as DbCard[]
    return {
      black: rows
        .filter((c) => c.type === 'black')
        .map((c) => ({ id: c.id, text: c.text, pick: (c.pick ?? 1) as 1 | 2 | 3, pack: c.pack })),
      white: rows
        .filter((c) => c.type === 'white')
        .map((c) => ({ id: c.id, text: c.text, pack: c.pack })),
    }
  } catch {
    return { black: [], white: [] }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns merged card arrays for the requested packs.
 * Static JSON cards are combined with any DB-stored cards for the same pack names.
 * Unknown pack names (not in static registry) are fetched from DB only.
 */
export async function getCardsByPacks(packs: string[]): Promise<{ black: BlackCard[]; white: WhiteCard[] }> {
  const staticResults = packs.map(loadStaticPack)
  const dbCards = await loadDbCards(packs)

  return {
    black: [...staticResults.flatMap((r) => r.black), ...dbCards.black],
    white: [...staticResults.flatMap((r) => r.white), ...dbCards.white],
  }
}

// ── Shuffle utilities ──────────────────────────────────────────────────────────

/**
 * Fisher-Yates in-place shuffle. Returns the same array (mutated).
 */
export function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i] as T
    arr[i] = arr[j] as T
    arr[j] = tmp
  }
  return arr
}

/**
 * Returns a new shuffled copy without mutating the original.
 */
export function shuffled<T>(arr: T[]): T[] {
  return shuffleInPlace([...arr])
}

/** Names of all statically bundled card packs. */
export const STATIC_PACK_NAMES = Object.keys(PACK_REGISTRY)
