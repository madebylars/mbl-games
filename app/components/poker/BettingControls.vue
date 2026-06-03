<template>
  <div class="controls">
    <div class="hand-display">
      <div
        v-for="(card, i) in myHoleCards ?? []"
        :key="i"
        class="card"
        :class="{ red: card.suit === 'hearts' || card.suit === 'diamonds' }"
      >
        <span class="rank">{{ card.rank }}</span>
        <span class="suit">{{ suitSymbol(card.suit) }}</span>
      </div>
    </div>

    <div v-if="canAct" class="btn-row">
      <button class="btn fold"  @click="$emit('fold')">Fold</button>

      <button v-if="canCheck" class="btn check" @click="$emit('check')">Check</button>
      <button v-else class="btn call" @click="$emit('call')">
        Call {{ formatChips(callAmount) }}
      </button>

      <button
        class="btn raise"
        :disabled="myChips <= callAmount"
        @click="showRaise = !showRaise"
      >
        Raise
      </button>

      <button
        class="btn allin"
        @click="$emit('all-in')"
      >
        All In
      </button>
    </div>

    <div v-if="canAct && showRaise" class="raise-panel">
      <div class="raise-row">
        <span class="raise-label">Raise to:</span>
        <span class="raise-value">{{ formatChips(raiseAmount) }}</span>
      </div>
      <input
        v-model.number="raiseAmountLocal"
        type="range"
        class="raise-slider"
        :min="minRaise"
        :max="maxRaise"
        :step="step"
      >
      <div class="raise-presets">
        <button class="preset-btn" @click="setPreset(0.33)">1/3 Pot</button>
        <button class="preset-btn" @click="setPreset(0.5)">½ Pot</button>
        <button class="preset-btn" @click="setPreset(1)">Pot</button>
        <button class="preset-btn" @click="setPreset(2)">2× Pot</button>
      </div>
      <button class="btn confirm-raise" :disabled="raiseAmountLocal < minRaise" @click="confirmRaise">
        Raise to {{ formatChips(raiseAmountLocal) }}
      </button>
    </div>

    <div v-if="!canAct && myHoleCards" class="waiting-turn">
      <span>Waiting for your turn…</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PokerCard } from '../../../shared/types/poker'

const props = defineProps<{
  canAct: boolean
  canCheck: boolean
  callAmount: number
  minRaise: number
  maxRaise: number
  raiseAmount: number
  myChips: number
  potTotal: number
  myHoleCards: [PokerCard, PokerCard] | null
}>()

const emit = defineEmits<{
  fold:       []
  check:      []
  call:       []
  'all-in':   []
  raise:      [amount: number]
}>()

const showRaise      = ref(false)
const raiseAmountLocal = ref(props.minRaise)

watch(() => props.minRaise, (v) => { raiseAmountLocal.value = v })
watch(() => props.canAct,   (v) => { if (!v) showRaise.value = false })

const step = computed(() => {
  const bb = Math.max(1, Math.round((props.maxRaise - props.minRaise) / 100))
  return bb
})

function setPreset(fraction: number) {
  const amount = Math.round(props.minRaise + props.potTotal * fraction)
  raiseAmountLocal.value = Math.min(Math.max(amount, props.minRaise), props.maxRaise)
}

function confirmRaise() {
  emit('raise', raiseAmountLocal.value)
  showRaise.value = false
}

function suitSymbol(suit: string): string {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit] ?? suit
}

function formatChips(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}
</script>

<style scoped>
.controls {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 0 12px 16px;
}

/* ── My hole cards ─────────────────────────────────────────────────────────── */
.hand-display { display: flex; gap: 8px; }
.card {
  width: 60px;
  height: 86px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ccc;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  color: #1a1a2e;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.card.red { color: #dc2626; }
.card .rank { font-size: 1.4rem; line-height: 1; }
.card .suit { font-size: 1.1rem; line-height: 1; }

/* ── Action buttons ────────────────────────────────────────────────────────── */
.btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  min-width: 80px;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }

.btn.fold   { background: #991b1b; color: #fef2f2; }
.btn.fold:hover   { background: #b91c1c; }
.btn.check  { background: #1e40af; color: #eff6ff; }
.btn.check:hover  { background: #2563eb; }
.btn.call   { background: #1e40af; color: #eff6ff; }
.btn.call:hover   { background: #2563eb; }
.btn.raise  { background: #ca8a04; color: #fefce8; }
.btn.raise:hover:not(:disabled) { background: #d97706; }
.btn.allin  { background: #7c3aed; color: #f5f3ff; }
.btn.allin:hover  { background: #8b5cf6; }

/* ── Raise panel ─────────────────────────────────────────────────────────── */
.raise-panel {
  width: 100%;
  background: #111a11;
  border: 1px solid #2d4a2d;
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.raise-row { display: flex; justify-content: space-between; align-items: center; }
.raise-label { font-size: 0.85rem; color: #94a3b8; }
.raise-value { font-size: 1.1rem; font-weight: 800; color: #fde047; }

.raise-slider {
  width: 100%;
  accent-color: #16a34a;
  cursor: pointer;
}

.raise-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.preset-btn {
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  border-radius: 8px;
  padding: 5px 10px;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.preset-btn:hover { border-color: #4ade80; color: #f1f5f9; }

.btn.confirm-raise {
  background: #16a34a;
  color: #f0fff4;
  width: 100%;
  padding: 10px;
}
.btn.confirm-raise:hover:not(:disabled) { background: #22c55e; }

/* ── Waiting ─────────────────────────────────────────────────────────────── */
.waiting-turn {
  font-size: 0.88rem;
  color: #64748b;
  padding: 8px 0;
}
</style>
