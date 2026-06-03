import type { PokerCard, PokerRank } from '../../shared/types/poker'

const RANK_VALUES: Record<PokerRank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

export interface HandResult {
  rank: number      // 0 = high card … 8 = straight flush/royal flush
  name: string
  score: number     // numeric comparison: higher = stronger hand
  bestFive: PokerCard[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [head, ...tail] = arr
  return [
    ...combos(tail, k - 1).map((c) => [head!, ...c]),
    ...combos(tail, k),
  ]
}

function encodeScore(rank: number, ...kickers: number[]): number {
  let s = rank * 15 ** 5
  for (let i = 0; i < Math.min(kickers.length, 5); i++) {
    s += (kickers[i] ?? 0) * 15 ** (4 - i)
  }
  return s
}

// Returns the straight's high card, or false. Handles the wheel (A-2-3-4-5 → 5).
function straightHigh(vals: number[]): number | false {
  if (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2) return 5
  for (let i = 0; i < 4; i++) if (vals[i]! - vals[i + 1]! !== 1) return false
  return vals[0]!
}

// ── 5-card evaluator ───────────────────────────────────────────────────────────

function eval5(hand: PokerCard[]): { rank: number; score: number; name: string } {
  const vals   = hand.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a)
  const suits  = hand.map((c) => c.suit)
  const isFlush = suits.every((s) => s === suits[0])
  const straight = straightHigh(vals)

  const cnt = new Map<number, number>()
  for (const v of vals) cnt.set(v, (cnt.get(v) ?? 0) + 1)
  const groups = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const sizes  = groups.map(([, c]) => c)

  if (isFlush && straight) {
    const isRoyal = straight === 14
    return { rank: 8, name: isRoyal ? 'Royal Flush' : 'Straight Flush', score: encodeScore(8, straight) }
  }
  if (sizes[0] === 4) {
    const quad   = groups.find(([, c]) => c === 4)![0]
    const kicker = groups.find(([, c]) => c === 1)![0]
    return { rank: 7, name: 'Four of a Kind', score: encodeScore(7, quad, kicker) }
  }
  if (sizes[0] === 3 && sizes[1] === 2) {
    const trip = groups.find(([, c]) => c === 3)![0]
    const pair = groups.find(([, c]) => c === 2)![0]
    return { rank: 6, name: 'Full House', score: encodeScore(6, trip, pair) }
  }
  if (isFlush) {
    return { rank: 5, name: 'Flush', score: encodeScore(5, ...vals) }
  }
  if (straight) {
    return { rank: 4, name: 'Straight', score: encodeScore(4, straight) }
  }
  if (sizes[0] === 3) {
    const trip    = groups.find(([, c]) => c === 3)![0]
    const kickers = groups.filter(([, c]) => c === 1).map(([v]) => v)
    return { rank: 3, name: 'Three of a Kind', score: encodeScore(3, trip, ...kickers) }
  }
  if (sizes[0] === 2 && sizes[1] === 2) {
    const pairs  = groups.filter(([, c]) => c === 2).map(([v]) => v).sort((a, b) => b - a)
    const kicker = groups.find(([, c]) => c === 1)![0]
    return { rank: 2, name: 'Two Pair', score: encodeScore(2, pairs[0]!, pairs[1]!, kicker) }
  }
  if (sizes[0] === 2) {
    const pair    = groups.find(([, c]) => c === 2)![0]
    const kickers = groups.filter(([, c]) => c === 1).map(([v]) => v)
    return { rank: 1, name: 'One Pair', score: encodeScore(1, pair, ...kickers) }
  }
  return { rank: 0, name: 'High Card', score: encodeScore(0, ...vals) }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function evaluateBestHand(
  holeCards: [PokerCard, PokerCard],
  communityCards: PokerCard[],
): HandResult {
  const all = [...holeCards, ...communityCards]
  const fives = combos(all, 5)

  let best: { rank: number; score: number; name: string; cards: PokerCard[] } | null = null

  for (const five of fives) {
    const res = eval5(five)
    if (!best || res.score > best.score) best = { ...res, cards: five }
  }

  return { rank: best!.rank, name: best!.name, score: best!.score, bestFive: best!.cards }
}

// Simple [0..1] preflop strength for bot decisions
export function preflopStrength(holeCards: [PokerCard, PokerCard]): number {
  const [a, b] = holeCards
  const va = RANK_VALUES[a.rank]
  const vb = RANK_VALUES[b.rank]
  const isPair   = a.rank === b.rank
  const isSuited = a.suit === b.suit
  const hi = Math.max(va, vb)
  const lo = Math.min(va, vb)
  const gap = hi - lo

  if (isPair) {
    if (hi >= 10) return 0.70 + (hi - 10) * 0.03   // TT=0.70 … AA=0.82
    if (hi >= 7)  return 0.62
    return 0.55
  }

  // Premium unpaired hands
  if (hi === 14 && lo >= 13) return isSuited ? 0.65 : 0.62  // AK
  if (hi === 14 && lo === 12) return isSuited ? 0.58 : 0.54  // AQ
  if (hi === 14 && lo === 11) return isSuited ? 0.52 : 0.48  // AJ
  if (hi === 13 && lo === 12) return isSuited ? 0.52 : 0.47  // KQ

  let score = 0.25 + (hi - 2) / 24.0 * 0.22 + (lo - 2) / 24.0 * 0.10
  if (isSuited) score += 0.05
  if (gap === 1) score += 0.05   // connector
  if (gap === 2) score += 0.02
  return Math.min(score, 0.54)
}
