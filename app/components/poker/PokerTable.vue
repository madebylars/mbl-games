<template>
  <div class="table-wrap">
    <div class="table-felt">

      <!-- Community cards + pot -->
      <div class="center-area">
        <div class="community-cards">
          <div
            v-for="(card, i) in filledCommunity"
            :key="i"
            class="card"
            :class="cardClass(card)"
          >
            <template v-if="card">
              <span class="rank">{{ card.rank }}</span>
              <span class="suit">{{ suitSymbol(card.suit) }}</span>
            </template>
          </div>
        </div>
        <div class="pot-display">
          <span class="pot-label">Pot</span>
          <span class="pot-amount">{{ formatChips(potTotal) }}</span>
        </div>
        <div v-if="room.phase === 'SHOWDOWN' || room.phase === 'SCORES'" class="phase-label showdown">
          {{ room.phase === 'SHOWDOWN' ? 'Showdown' : 'Results' }}
        </div>
      </div>

      <!-- Player seats positioned around the table -->
      <div
        v-for="(seat, idx) in seats"
        :key="seat.player.id"
        class="seat"
        :class="{
          active: seat.player.id === room.activePlayerId,
          folded: seat.player.folded,
          allin: seat.player.allIn,
          me: seat.player.id === myPlayerId,
          winner: seat.player.isWinner,
        }"
        :style="seatPosition(idx, seats.length)"
      >
        <!-- Dealer / blind badges -->
        <div class="seat-badges">
          <span v-if="seat.player.isDealer"      class="chip dealer">D</span>
          <span v-if="seat.player.isSmallBlind"  class="chip sb">SB</span>
          <span v-if="seat.player.isBigBlind"    class="chip bb">BB</span>
        </div>

        <!-- Cards -->
        <div class="seat-cards">
          <template v-if="seat.player.holeCards">
            <div
              v-for="(card, ci) in seat.player.holeCards"
              :key="ci"
              class="card small"
              :class="cardClass(card)"
            >
              <span class="rank">{{ card.rank }}</span>
              <span class="suit">{{ suitSymbol(card.suit) }}</span>
            </div>
          </template>
          <template v-else-if="!seat.player.folded && isActiveHand">
            <div class="card small back" />
            <div class="card small back" />
          </template>
        </div>

        <!-- Name & chips -->
        <div class="seat-info">
          <span class="seat-name">{{ seat.player.name }}</span>
          <span class="seat-chips">{{ formatChips(seat.player.chips) }}</span>
          <span v-if="seat.player.handName" class="hand-name">{{ seat.player.handName }}</span>
          <span v-if="seat.player.allIn" class="status-tag">ALL IN</span>
          <span v-if="seat.player.folded" class="status-tag folded">FOLD</span>
          <span v-if="seat.player.isWinner" class="winner-crown">👑</span>
        </div>

        <!-- Current bet -->
        <div v-if="seat.player.currentBet > 0" class="bet-chip">
          {{ formatChips(seat.player.currentBet) }}
        </div>

        <!-- Timer ring for active player -->
        <div v-if="seat.player.id === room.activePlayerId && timerSeconds > 0" class="timer-ring">
          <svg viewBox="0 0 40 40" class="timer-svg">
            <circle class="timer-track" cx="20" cy="20" r="17" />
            <circle
              class="timer-progress"
              cx="20" cy="20" r="17"
              :stroke-dasharray="`${timerArc} 107`"
            />
          </svg>
          <span class="timer-num">{{ timerSeconds }}</span>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import type { PokerCard, PokerRoom } from '../../../shared/types/poker'
import { PokerPhase } from '../../../shared/types/poker'

const props = defineProps<{
  room: PokerRoom
  myPlayerId: string
  myHoleCards: [PokerCard, PokerCard] | null
  potTotal: number
  timerSeconds: number
  timerMax: number
}>()

// ── Seat ordering ─ my player always last (bottom) ────────────────────────────
const seats = computed(() => {
  const players = props.room.players
  const myIdx   = players.findIndex((p) => p.id === props.myPlayerId)
  if (myIdx === -1) return players.map((p) => ({ player: p }))
  // Rotate so my player is last
  const rotated = [...players.slice(myIdx + 1), ...players.slice(0, myIdx + 1)]
  return rotated.map((p) => ({ player: p }))
})

const isActiveHand = computed(() =>
  [PokerPhase.PREFLOP, PokerPhase.FLOP, PokerPhase.TURN, PokerPhase.RIVER, PokerPhase.SHOWDOWN, PokerPhase.SCORES]
    .includes(props.room.phase as PokerPhase),
)

// ── Community cards padded to 5 slots ─────────────────────────────────────────
const filledCommunity = computed<(PokerCard | null)[]>(() => {
  const cards = props.room.communityCards
  return [...cards, null, null, null, null, null].slice(0, 5)
})

// ── Seat positions around the oval ────────────────────────────────────────────
// Returns { top, left } as CSS string values.
// My player = last seat, always at bottom center.
function seatPosition(idx: number, total: number): Record<string, string> {
  // Angle 0 = right, angle increases clockwise. My seat (last) = bottom (90°).
  // We want my seat at 270° (bottom of circle). Other seats spread evenly.
  const myAngleDeg  = 270
  const angleStep   = 360 / total
  const baseAngle   = myAngleDeg - angleStep * (total - 1 - idx)
  const angleRad    = (baseAngle * Math.PI) / 180

  // Oval radii (% of container)
  const rx = 42  // horizontal
  const ry = 35  // vertical
  const cx = 50  // center x
  const cy = 50  // center y

  const left = cx + rx * Math.cos(angleRad)
  const top  = cy + ry * Math.sin(angleRad)

  return { left: `${left}%`, top: `${top}%` }
}

// ── Card helpers ──────────────────────────────────────────────────────────────
function suitSymbol(suit: string): string {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] ?? suit
}

function cardClass(card: PokerCard | null): Record<string, boolean> {
  if (!card) return { empty: true }
  return { red: card.suit === 'hearts' || card.suit === 'diamonds' }
}

function formatChips(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

// Timer arc: full circle = 107 (circumference of r=17 circle ≈ 106.8)
const timerArc = computed(() => {
  if (props.timerMax <= 0) return 0
  return Math.max(0, (props.timerSeconds / props.timerMax) * 107)
})
</script>

<style scoped>
.table-wrap {
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 20px 8px;
}

.table-felt {
  position: relative;
  width: 100%;
  padding-top: 62%;   /* aspect ratio ~1.6:1 */
  background: radial-gradient(ellipse at center, #1a5c2a 40%, #0f3d1a 100%);
  border-radius: 50% / 40%;
  border: 8px solid #0a2810;
  box-shadow: 0 0 0 4px #1a4a20, 0 20px 60px rgba(0, 0, 0, 0.7), inset 0 2px 8px rgba(0,0,0,0.4);
}

/* ── Center area ────────────────────────────────────────────────────────────── */
.center-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.community-cards {
  display: flex;
  gap: 6px;
}

/* ── Card ───────────────────────────────────────────────────────────────────── */
.card {
  width: 52px;
  height: 74px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #1a1a2e;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  position: relative;
  user-select: none;
}

.card.red { color: #dc2626; }

.card.empty {
  background: rgba(255,255,255,0.06);
  border: 1.5px dashed rgba(255,255,255,0.2);
  box-shadow: none;
}

.card.back {
  background: #16275c;
  border-color: #1a3070;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 4px,
    rgba(255,255,255,0.05) 4px,
    rgba(255,255,255,0.05) 5px
  );
}

.card.small {
  width: 32px;
  height: 44px;
  font-size: 0.72rem;
  border-radius: 4px;
}

.card .rank { font-size: 1.2rem; line-height: 1; }
.card .suit { font-size: 0.95rem; line-height: 1; }
.card.small .rank { font-size: 0.8rem; }
.card.small .suit { font-size: 0.68rem; }

/* ── Pot ────────────────────────────────────────────────────────────────────── */
.pot-display {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,0,0,0.35);
  border-radius: 20px;
  padding: 4px 14px;
}
.pot-label { font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
.pot-amount { font-size: 1rem; font-weight: 800; color: #fde047; }

.phase-label.showdown {
  font-size: 0.75rem;
  color: #fbbf24;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* ── Seats ──────────────────────────────────────────────────────────────────── */
.seat {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 88px;
  cursor: default;
  z-index: 2;
}

.seat.me .seat-info { border-color: #4ade80; }
.seat.active .seat-info { box-shadow: 0 0 0 2px #fbbf24, 0 0 12px #fbbf2466; }
.seat.winner .seat-info { box-shadow: 0 0 0 2px #fde047, 0 0 16px #fde04766; }
.seat.folded { opacity: 0.45; }

.seat-badges { display: flex; gap: 3px; }
.chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0;
}
.chip.dealer  { background: #e2e8f0; color: #1a1a2e; }
.chip.sb      { background: #3b82f6; color: #fff; }
.chip.bb      { background: #ef4444; color: #fff; }

.seat-cards { display: flex; gap: 3px; }

.seat-info {
  background: rgba(0,0,0,0.6);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 5px 8px;
  text-align: center;
  width: 100%;
  position: relative;
}
.seat-name { display: block; font-size: 0.8rem; font-weight: 600; color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seat-chips { display: block; font-size: 0.72rem; color: #fde047; font-weight: 700; }
.hand-name  { display: block; font-size: 0.6rem; color: #4ade80; font-weight: 700; margin-top: 1px; }

.status-tag {
  display: block;
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #ef4444;
  text-transform: uppercase;
}
.status-tag.folded { color: #64748b; }

.winner-crown {
  position: absolute;
  bottom: -10px;
  right: -4px;
  font-size: 0.9rem;
}

/* ── Bet chip ────────────────────────────────────────────────────────────────── */
.bet-chip {
  background: #ca8a04;
  color: #fff;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(0,0,0,0.5);
  margin-top: 2px;
}

/* ── Timer ────────────────────────────────────────────────────────────────────── */
.timer-ring {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 40px;
  pointer-events: none;
}
.timer-svg { width: 40px; height: 40px; transform: rotate(-90deg); }
.timer-track    { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 3; }
.timer-progress { fill: none; stroke: #fbbf24; stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 0.5s linear; }
.timer-num {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.62rem;
  font-weight: 800;
  color: #fbbf24;
}
</style>
