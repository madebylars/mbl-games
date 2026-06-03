<template>
  <div class="played-area">

    <!-- Instruction for the Czar -->
    <p v-if="canJudge && !winnerId" class="czar-instruction">
      {{ allRevealed ? t.crownWinner : t.revealCards }}
    </p>
    <p v-else-if="!canJudge && !winnerId" class="waiting-instruction">
      {{ t.waitingJudge(czarName) }}
    </p>

    <!-- Submissions grid -->
    <div class="submissions-grid">
      <div
        v-for="(sub, index) in submissions"
        :key="index"
        class="submission"
        :class="{
          revealed: sub.revealed,
          winner: sub.playerId === winnerId,
          interactive: isInteractive(sub, index),
        }"
        @click="handleClick(sub, index)"
      >
        <!-- Stack visual for multi-pick cards -->
        <div class="card-stack">

          <!-- Face-down state -->
          <template v-if="!sub.revealed">
            <div class="card-face face-down">
              <span class="face-down-icon">🃏</span>
              <span v-if="canJudge" class="reveal-hint">{{ t.tapReveal }}</span>
            </div>
          </template>

          <!-- Revealed state -->
          <template v-else>
            <div
              v-for="(cardId, ci) in sub.cards"
              :key="ci"
              class="card-face face-up"
              :style="{ transform: `rotate(${(ci - (sub.cards.length - 1) / 2) * 4}deg)` }"
            >
              <p class="card-text">{{ cardIndex[cardId]?.text ?? '…' }}</p>
              <span v-if="sub.playerId === winnerId" class="winner-crown">👑</span>
            </div>
          </template>

        </div>

        <!-- Winner label -->
        <div v-if="sub.playerId === winnerId && players" class="winner-label">
          {{ players.find(p => p.id === sub.playerId)?.name ?? t.winner }}
        </div>

        <!-- Pick as winner button (shown when all revealed, czar, no winner yet) -->
        <button
          v-if="canJudge && sub.revealed && !winnerId && allRevealed"
          class="pick-btn"
          @click.stop="$emit('pickWinner', index)"
        >
          {{ t.pick }}
        </button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import type { Player, Submission, WhiteCard } from '../../../shared/types/cah'

const props = defineProps<{
  submissions: Submission[]
  cardIndex: Record<string, WhiteCard>
  canJudge: boolean
  czarName: string
  winnerId: string | null
  players?: Player[]
  lang?: 'en' | 'sv'
}>()

const STRINGS = {
  en: {
    crownWinner:   '👑 Tap a card to crown the winner',
    revealCards:   '⚖️ Tap each card to reveal it',
    waitingJudge:  (name: string) => `Waiting for ${name} to judge…`,
    tapReveal:     'tap to reveal',
    pick:          '👑 Pick',
    winner:        'Winner',
  },
  sv: {
    crownWinner:   '👑 Tryck på ett kort för att kröna vinnaren',
    revealCards:   '⚖️ Tryck på varje kort för att avslöja det',
    waitingJudge:  (name: string) => `Väntar på att ${name} ska döma…`,
    tapReveal:     'tryck för att avslöja',
    pick:          '👑 Välj',
    winner:        'Vinnare',
  },
}
const t = computed(() => STRINGS[props.lang ?? 'en'])

const emit = defineEmits<{
  reveal: [index: number]
  pickWinner: [index: number]
}>()

const allRevealed = computed(() =>
  props.submissions.length > 0 && props.submissions.every((s) => s.revealed),
)

function isInteractive(sub: Submission, index: number) {
  if (!props.canJudge) return false
  if (!sub.revealed) return true                           // tap to reveal
  if (!props.winnerId && allRevealed.value) return false  // use the Pick button instead
  return false
}

function handleClick(sub: Submission, index: number) {
  if (!props.canJudge) return
  if (!sub.revealed) {
    emit('reveal', index)
  }
}
</script>

<style scoped>
.played-area {
  width: 100%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.czar-instruction,
.waiting-instruction {
  text-align: center;
  font-size: 0.95rem;
  color: #94a3b8;
  font-style: italic;
}

.submissions-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: center;
}

/* Each submission slot */
.submission {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 160px;
}

.card-stack {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Face-down card */
.card-face {
  border-radius: 12px;
  width: 100%;
  min-height: 110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
}

.face-down {
  background: #1e1e2e;
  border: 2px solid #2d2d44;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s;
}

.submission.interactive .face-down:hover {
  border-color: #818cf8;
  transform: translateY(-4px);
}

.face-down-icon {
  font-size: 2rem;
  opacity: 0.3;
}

.reveal-hint {
  font-size: 0.72rem;
  color: #475569;
  letter-spacing: 0.05em;
}

/* Revealed card */
.face-up {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  padding: 12px;
  position: relative;
  width: 100%;
}

.submission.winner .face-up {
  border-color: #fbbf24;
  background: #fffbeb;
  box-shadow: 0 4px 16px rgba(251, 191, 36, 0.3);
}

.card-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
}

.winner-crown {
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 1rem;
}

.winner-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #fbbf24;
}

/* Pick button */
.pick-btn {
  padding: 7px 14px;
  background: #1c1810;
  border: 1px solid #fbbf24;
  border-radius: 8px;
  color: #fbbf24;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  width: 100%;
}
.pick-btn:hover { background: #2d2410; }
</style>
