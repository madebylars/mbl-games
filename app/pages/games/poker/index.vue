<template>
  <div class="page">

    <nav class="nav">
      <NuxtLink to="/games" class="back">← Games</NuxtLink>
    </nav>

    <header class="hero">
      <div class="card-preview">
        <span class="card-preview-icon">♠ ♥ ♦ ♣</span>
      </div>
      <h1 class="title">Texas Hold'em</h1>
      <p class="subtitle">Multiplayer · Up to 8 players · Bot support</p>
    </header>

    <!-- Name gate -->
    <div v-if="!nameConfirmed" class="name-gate">
      <p class="name-prompt">What should we call you?</p>
      <div class="name-row">
        <input
          v-model="playerName"
          class="name-input"
          type="text"
          maxlength="24"
          placeholder="Your name…"
          autofocus
          @keydown.enter="confirmName"
        >
        <button class="name-btn" :disabled="!playerName.trim()" @click="confirmName">
          Let's play →
        </button>
      </div>
    </div>

    <template v-else>
      <div class="greeting">
        Playing as <strong>{{ playerName }}</strong>
        <button class="change-name" @click="nameConfirmed = false">change</button>
      </div>

      <div class="actions">
        <button class="btn primary" @click="showCreate = true">
          ✚ Create game
        </button>
        <button class="btn demo" :disabled="creatingDemo" @click="createDemo">
          <span v-if="creatingDemo">Starting…</span>
          <span v-else>🤖 Play vs bots</span>
        </button>
      </div>

      <div class="join-code">
        <input
          v-model="roomCode"
          class="code-input"
          type="text"
          maxlength="6"
          placeholder="Enter room code…"
          @keydown.enter="joinByCode"
        >
        <button class="btn secondary" :disabled="roomCode.length < 4" @click="joinByCode">
          Join →
        </button>
      </div>

      <PokerLobbyList
        :rooms="rooms"
        :refreshing="refreshing"
        @join="joinRoom"
        @refresh="loadRooms"
      />
    </template>

    <PokerCreateRoomModal
      v-if="showCreate"
      :player-name="playerName"
      @close="showCreate = false"
      @created="joinRoom"
    />

  </div>
</template>

<script setup lang="ts">
import type { PokerRoomSummary } from '../../../../shared/types/poker'
import { usePokerPlayerName } from '../../../composables/usePokerGame'

const playerName    = usePokerPlayerName()
const nameConfirmed = ref(false)
const showCreate    = ref(false)
const roomCode      = ref('')
const creatingDemo  = ref(false)
const rooms         = ref<PokerRoomSummary[]>([])
const refreshing    = ref(false)

onMounted(() => {
  if (playerName.value.trim()) nameConfirmed.value = true
  loadRooms()
})

let pollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => { pollTimer = setInterval(loadRooms, 8_000) })
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

function confirmName() {
  if (!playerName.value.trim()) return
  playerName.value = playerName.value.trim()
  nameConfirmed.value = true
}

async function loadRooms() {
  refreshing.value = true
  try { rooms.value = await $fetch<PokerRoomSummary[]>('/api/games/poker/rooms') }
  catch { /* stale data is fine */ }
  finally { refreshing.value = false }
}

function joinRoom(roomId: string) {
  navigateTo(`/games/poker/${roomId}`)
}

function joinByCode() {
  const code = roomCode.value.trim().toUpperCase()
  if (code.length < 4) return
  navigateTo(`/games/poker/${code}`)
}

async function createDemo() {
  if (creatingDemo.value) return
  creatingDemo.value = true
  try {
    const data = await $fetch<{ roomId: string }>('/api/games/poker/rooms', {
      method: 'POST',
      body: {
        config: {
          name: `${playerName.value}'s Table`,
          isPublic: false,
          startingChips: 1000,
          smallBlind: 10,
          bigBlind: 20,
          turnTimerSeconds: 30,
        },
        bots: 3,
      },
    })
    navigateTo(`/games/poker/${data.roomId}`)
  } catch { /* swallow */ }
  finally { creatingDemo.value = false }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 24px 80px;
  background: radial-gradient(ellipse at top, #0d2818 0%, #0a0a14 60%);
  gap: 32px;
}

.nav { width: 100%; max-width: 600px; }
.back { font-size: 0.9rem; color: #64748b; text-decoration: none; transition: color 0.2s; }
.back:hover { color: #94a3b8; }

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.card-preview {
  background: #1a3a1a;
  border: 2px solid #2d5a2d;
  border-radius: 14px;
  padding: 20px 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
.card-preview-icon {
  font-size: 2rem;
  letter-spacing: 0.15em;
  color: #f0f0f0;
}
.card-preview-icon :nth-child(2),
.card-preview-icon :nth-child(4) { color: #ef4444; }

.title { font-size: clamp(1.8rem, 5vw, 2.6rem); font-weight: 800; color: #f1f5f9; }
.subtitle { font-size: 0.9rem; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; }

.name-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 400px;
}
.name-prompt { font-size: 1.1rem; color: #94a3b8; }
.name-row { display: flex; gap: 10px; width: 100%; }
.name-input {
  flex: 1;
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  border-radius: 10px;
  padding: 12px 16px;
  color: #f1f5f9;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.name-input::placeholder { color: #475569; }
.name-input:focus { border-color: #4ade80; }
.name-btn {
  padding: 12px 20px;
  background: #16a34a;
  border: none;
  border-radius: 10px;
  color: #f0fff4;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.name-btn:hover:not(:disabled) { background: #22c55e; }
.name-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.greeting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  color: #64748b;
}
.greeting strong { color: #f1f5f9; }
.change-name {
  background: none;
  border: none;
  color: #4ade80;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-family: inherit;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  max-width: 600px;
}

.btn {
  padding: 13px 28px;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}
.btn.primary { background: #16a34a; color: #f0fff4; flex: 1; min-width: 160px; }
.btn.primary:hover { background: #22c55e; }
.btn.demo {
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  color: #94a3b8;
  flex: 1;
  min-width: 140px;
}
.btn.demo:hover:not(:disabled) { border-color: #4ade80; color: #f1f5f9; }
.btn.demo:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.secondary {
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  color: #94a3b8;
  padding: 12px 20px;
}
.btn.secondary:hover:not(:disabled) { border-color: #4ade80; color: #f1f5f9; }
.btn.secondary:disabled { opacity: 0.4; cursor: not-allowed; }

.join-code { display: flex; gap: 10px; width: 100%; max-width: 600px; }
.code-input {
  flex: 1;
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  border-radius: 10px;
  padding: 12px 16px;
  color: #f1f5f9;
  font-size: 1rem;
  font-family: inherit;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  outline: none;
  transition: border-color 0.2s;
}
.code-input::placeholder { color: #475569; text-transform: none; letter-spacing: 0; }
.code-input:focus { border-color: #4ade80; }
</style>
