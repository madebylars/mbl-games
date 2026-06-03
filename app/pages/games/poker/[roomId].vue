<template>
  <div class="room-page">

    <!-- Nav -->
    <nav class="nav">
      <NuxtLink to="/games/poker" class="back">← Lobby</NuxtLink>
      <span class="nav-title">{{ room?.config.name ?? 'Poker' }}</span>
      <div class="nav-right">
        <span v-if="room" class="nav-chips">
          {{ myPlayer ? myPlayer.chips.toLocaleString() + ' chips' : '' }}
        </span>
      </div>
    </nav>

    <!-- Connection banner -->
    <Transition name="banner">
      <div v-if="status === 'disconnected' || status === 'connecting'" class="reconnect-banner">
        <div class="spinner small" />
        {{ status === 'connecting' ? 'Connecting…' : 'Connection lost — reconnecting…' }}
      </div>
    </Transition>

    <!-- Error toast -->
    <Transition name="toast">
      <div v-if="error" class="error-toast" @click="clearError">
        ⚠ {{ error }}
      </div>
    </Transition>

    <!-- Loading / error state -->
    <div v-if="!room" class="center-msg">
      <div v-if="status === 'error'" class="error-state">
        <p class="big-icon">♠</p>
        <p>Could not connect to this table.</p>
        <NuxtLink to="/games/poker" class="back-link">← Back to lobby</NuxtLink>
      </div>
      <div v-else class="loading-state">
        <div class="spinner" />
        <p>Joining table…</p>
      </div>
    </div>

    <!-- LOBBY: waiting room -->
    <PokerWaitingRoom
      v-else-if="room.phase === 'LOBBY'"
      :room="room"
      :my-player-id="playerId"
      :is-host="myPlayer?.isHost ?? false"
      @start="startGame"
      @kick="kickPlayer"
    />

    <!-- GAME_OVER -->
    <PokerGameOverScreen
      v-else-if="room.phase === 'GAME_OVER'"
      :final-standings="gameOverStandings"
      :my-player-id="playerId"
    />

    <!-- Active game -->
    <template v-else>
      <PokerTable
        :room="room"
        :my-player-id="playerId"
        :my-hole-cards="myHoleCards"
        :pot-total="potTotal"
        :timer-seconds="timerSeconds"
        :timer-max="room.config.turnTimerSeconds"
      />

      <!-- Phase label -->
      <div class="street-label">
        <span class="street-badge" :class="room.phase.toLowerCase()">
          {{ phaseLabel }}
        </span>
        <span v-if="room.phase !== 'SHOWDOWN' && room.phase !== 'SCORES'" class="hand-num">
          Hand #{{ room.handNumber }}
        </span>
      </div>

      <!-- Betting controls (my turn or show my cards) -->
      <PokerBettingControls
        :can-act="canAct"
        :can-check="canCheck"
        :call-amount="callAmount"
        :min-raise="minRaise"
        :max-raise="maxRaise"
        :raise-amount="raiseAmount"
        :my-chips="myPlayer?.chips ?? 0"
        :pot-total="potTotal"
        :my-hole-cards="myHoleCards"
        @fold="fold"
        @check="check"
        @call="call"
        @raise="handleRaise"
        @all-in="allIn"
      />

      <!-- Active player indicator -->
      <div v-if="room.activePlayerId && room.phase !== 'SHOWDOWN' && room.phase !== 'SCORES'" class="active-indicator">
        <span v-if="room.activePlayerId === playerId" class="your-turn">Your turn!</span>
        <span v-else class="waiting-for">{{ activePlayerName }}'s turn</span>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import type { PokerPlayer } from '../../../../shared/types/poker'
import { PokerPhase } from '../../../../shared/types/poker'
import { usePokerGame } from '../../../composables/usePokerGame'

const route  = useRoute()
const roomId = computed(() => String(route.params.roomId ?? '').toUpperCase())

const {
  playerName,
  playerId,
  status,
  room,
  myHoleCards,
  myPlayer,
  canAct,
  canCheck,
  callAmount,
  minRaise,
  maxRaise,
  raiseAmount,
  potTotal,
  timerSeconds,
  error,
  startGame,
  fold,
  check,
  call,
  raise,
  allIn,
  kickPlayer,
  clearError,
} = usePokerGame(roomId)

// ── Derived ────────────────────────────────────────────────────────────────────

const phaseLabel = computed(() => {
  const labels: Record<string, string> = {
    [PokerPhase.PREFLOP]:  'Pre-Flop',
    [PokerPhase.FLOP]:     'Flop',
    [PokerPhase.TURN]:     'Turn',
    [PokerPhase.RIVER]:    'River',
    [PokerPhase.SHOWDOWN]: 'Showdown',
    [PokerPhase.SCORES]:   'Results',
  }
  return labels[room.value?.phase ?? ''] ?? ''
})

const activePlayerName = computed(() => {
  const pid = room.value?.activePlayerId
  return room.value?.players.find((p) => p.id === pid)?.name ?? ''
})

const gameOverStandings = ref<PokerPlayer[]>([])
watch(room, (r) => {
  if (r && r.phase === PokerPhase.GAME_OVER) {
    gameOverStandings.value = [...r.players].sort((a, b) => b.chips - a.chips)
  }
})

function handleRaise(amount: number) {
  raiseAmount.value = amount
  raise()
}
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: radial-gradient(ellipse at top, #0d2010 0%, #070d0a 60%);
  padding-bottom: 40px;
}

/* ── Nav ──────────────────────────────────────────────────────────────────── */
.nav {
  width: 100%;
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #1a2e1a;
  gap: 12px;
}
.back { font-size: 0.9rem; color: #64748b; text-decoration: none; transition: color 0.2s; }
.back:hover { color: #94a3b8; }
.nav-title { flex: 1; font-size: 1rem; font-weight: 700; color: #e2e8f0; text-align: center; }
.nav-right { min-width: 80px; text-align: right; }
.nav-chips { font-size: 0.85rem; color: #4ade80; font-weight: 700; }

/* ── Banner ───────────────────────────────────────────────────────────────── */
.reconnect-banner {
  width: 100%;
  background: #1a1a0a;
  border-bottom: 1px solid #3b3b00;
  color: #fde047;
  font-size: 0.88rem;
  padding: 8px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.banner-enter-active, .banner-leave-active { transition: opacity 0.3s, transform 0.3s; }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── Error toast ──────────────────────────────────────────────────────────── */
.error-toast {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  background: #7f1d1d;
  color: #fef2f2;
  border: 1px solid #991b1b;
  border-radius: 10px;
  padding: 10px 20px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  z-index: 50;
  max-width: 400px;
  text-align: center;
}
.toast-enter-active, .toast-leave-active { transition: opacity 0.3s, transform 0.3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-10px); }

/* ── Loading / error ──────────────────────────────────────────────────────── */
.center-msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #94a3b8;
  text-align: center;
}
.big-icon { font-size: 3rem; }
.back-link { color: #4ade80; font-weight: 700; text-decoration: none; font-size: 0.95rem; }

/* ── Spinner ──────────────────────────────────────────────────────────────── */
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #1e3a1e;
  border-top-color: #4ade80;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner.small { width: 16px; height: 16px; border-width: 2px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Street label ─────────────────────────────────────────────────────────── */
.street-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
}

.street-badge {
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: #1e3a1e;
  color: #4ade80;
  border: 1px solid #2d5a2d;
}
.street-badge.preflop { background: #1e2a3a; border-color: #2d4a5a; color: #60a5fa; }
.street-badge.flop    { background: #1e3a1e; border-color: #2d5a2d; color: #4ade80; }
.street-badge.turn    { background: #2d2a0a; border-color: #4a4a1a; color: #fde047; }
.street-badge.river   { background: #3a1a1e; border-color: #5a2d3a; color: #f87171; }
.street-badge.showdown { background: #3a2a0a; border-color: #6a4a1a; color: #fbbf24; }
.street-badge.scores  { background: #1a2a0a; border-color: #3a4a1a; color: #86efac; }

.hand-num { font-size: 0.78rem; color: #475569; }

/* ── Active player indicator ───────────────────────────────────────────────── */
.active-indicator {
  padding: 6px 20px;
  font-size: 0.9rem;
  font-weight: 700;
}
.your-turn { color: #fbbf24; animation: pulse 1s ease-in-out infinite alternate; }
.waiting-for { color: #64748b; }

@keyframes pulse {
  from { opacity: 0.7; }
  to   { opacity: 1; }
}
</style>
