<template>
  <div class="page">

    <nav class="nav">
      <NuxtLink to="/games" class="back">← Games</NuxtLink>
    </nav>

    <!-- Header -->
    <header class="hero">
      <div class="black-card-preview">
        <p class="black-card-text"><span class="blank">{{ t.tagline }}</span></p>
      </div>
      <h1 class="title">{{ t.title }}</h1>
      <p class="subtitle">{{ t.subtitle }}</p>
    </header>

    <!-- Name input -->
    <div v-if="!nameConfirmed" class="name-gate">
      <p class="name-prompt">{{ t.namePrompt }}</p>
      <div class="name-row">
        <input
          v-model="playerName"
          class="name-input"
          type="text"
          maxlength="24"
          :placeholder="t.namePlaceholder"
          autofocus
          @keydown.enter="confirmName"
        >
        <button class="name-btn" :disabled="!playerName.trim()" @click="confirmName">
          {{ t.letsGo }}
        </button>
      </div>
    </div>

    <!-- Lobby actions -->
    <template v-else>
      <div class="greeting">
        {{ t.playingAs }} <strong>{{ playerName }}</strong>
        <button class="change-name" @click="nameConfirmed = false">{{ t.change }}</button>
      </div>

      <div class="actions">
        <button class="btn primary" @click="showCreate = true">
          ✚ {{ t.createGame }}
        </button>
        <button class="btn demo" :disabled="creatingDemo" @click="createDemo">
          <span v-if="creatingDemo">{{ t.starting }}</span>
          <span v-else>🤖 {{ t.soloDemo }}</span>
        </button>
      </div>

      <!-- Join by code -->
      <div class="join-code">
        <input
          v-model="roomCode"
          class="code-input"
          type="text"
          maxlength="6"
          :placeholder="t.roomCodePlaceholder"
          @keydown.enter="joinByCode"
        >
        <button class="btn secondary" :disabled="roomCode.length < 4" @click="joinByCode">
          {{ t.join }}
        </button>
      </div>

      <!-- Public room list -->
      <CahLobbyList
        :rooms="rooms"
        :refreshing="refreshing"
        @join="joinRoom"
        @refresh="loadRooms"
      />
    </template>

    <!-- Create room modal -->
    <CahCreateRoomModal
      v-if="showCreate"
      @close="showCreate = false"
      @created="joinRoom"
    />

  </div>
</template>

<script setup lang="ts">
import type { PublicRoomSummary } from '../../../../shared/types/core'

// ── Language / pack ────────────────────────────────────────────────────────────
type CahPack = 'en' | 'sv' | 'sv-xl' | 'sv-all'
const cahPack = ref<CahPack>('sv-all')
onMounted(() => {
  cahPack.value = (localStorage.getItem('cah-pack') as CahPack) ?? 'sv-all'
})
const lang = computed<'en' | 'sv'>(() => cahPack.value === 'en' ? 'en' : 'sv')
const packsForKey: Record<CahPack, string[]> = {
  'en': ['base'],
  'sv': ['swedish'],
  'sv-xl': ['swedish-xl'],
  'sv-all': ['swedish', 'swedish-xl'],
}

const STRINGS = {
  en: {
    tagline:           'Unfiltered. Unapologetic. Unforgettable.',
    title:             'Appropriately Disgusting',
    subtitle:          'Multiplayer · Up to 10 players',
    namePrompt:        'What should we call you?',
    namePlaceholder:   'Your name…',
    letsGo:            'Let\'s go →',
    playingAs:         'Playing as',
    change:            'change',
    createGame:        'Create game',
    starting:          'Starting…',
    soloDemo:          'Solo demo',
    roomCodePlaceholder: 'Enter room code…',
    join:              'Join →',
  },
  sv: {
    tagline:           'Ofiltrerat. Oursäktat. Oförglömligt.',
    title:             'Lagom Äckligt',
    subtitle:          'Multiplayer · Upp till 10 spelare',
    namePrompt:        'Vad ska vi kalla dig?',
    namePlaceholder:   'Ditt namn…',
    letsGo:            'Kör! →',
    playingAs:         'Spelar som',
    change:            'ändra',
    createGame:        'Skapa spel',
    starting:          'Startar…',
    soloDemo:          'Solo-demo',
    roomCodePlaceholder: 'Ange rumskod…',
    join:              'Gå med →',
  },
}

const t = computed(() => STRINGS[lang.value])

// ── Game state ─────────────────────────────────────────────────────────────────
const playerName    = useCAHPlayerName()
const nameConfirmed = ref(false)
const showCreate    = ref(false)
const roomCode      = ref('')
const creatingDemo  = ref(false)
const rooms         = ref<PublicRoomSummary[]>([])
const refreshing    = ref(false)

onMounted(() => {
  if (playerName.value.trim()) nameConfirmed.value = true
  loadRooms()
})

// Poll public rooms every 8 seconds while on this page
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
  try {
    rooms.value = await $fetch<PublicRoomSummary[]>('/api/games/cah/rooms')
  } catch { /* swallow — UI stays with stale data */ }
  finally { refreshing.value = false }
}

function joinRoom(roomId: string) {
  navigateTo(`/games/cah/${roomId}`)
}

function joinByCode() {
  const code = roomCode.value.trim().toUpperCase()
  if (code.length < 4) return
  navigateTo(`/games/cah/${code}`)
}

async function createDemo() {
  if (creatingDemo.value) return
  creatingDemo.value = true
  try {
    const data = await $fetch<{ roomId: string }>('/api/games/cah/rooms', {
      method: 'POST',
      body: {
        config: {
          name: `${playerName.value}'s Demo`,
          isPublic: false,
          pointsToWin: 5,
          maxPlayers: 5,
          packs: packsForKey[cahPack.value],
        },
        bots: 3,
      },
    })
    navigateTo(`/games/cah/${data.roomId}`)
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
  background: radial-gradient(ellipse at top, #1a1a2e 0%, #0f0f1a 60%);
  gap: 32px;
}

/* Nav */
.nav {
  width: 100%;
  max-width: 600px;
}
.back {
  font-size: 0.9rem;
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
}
.back:hover { color: #94a3b8; }

/* Hero */
.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.black-card-preview {
  background: #111;
  border-radius: 14px;
  padding: 24px 32px;
  border: 2px solid #222;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}
.black-card-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.5;
}
.blank {
  display: inline-block;
  border-bottom: 3px solid #f8fafc;
  padding-bottom: 1px;
  min-width: 80px;
}

.title {
  font-size: clamp(1.6rem, 5vw, 2.4rem);
  font-weight: 800;
  color: #f1f5f9;
}
.subtitle {
  font-size: 0.9rem;
  color: #64748b;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Name gate */
.name-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 400px;
}
.name-prompt {
  font-size: 1.1rem;
  color: #94a3b8;
}
.name-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.name-input {
  flex: 1;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  padding: 12px 16px;
  color: #f1f5f9;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.name-input::placeholder { color: #475569; }
.name-input:focus { border-color: #818cf8; }
.name-btn {
  padding: 12px 20px;
  background: #818cf8;
  border: none;
  border-radius: 10px;
  color: #0f0f1a;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
}
.name-btn:hover:not(:disabled) { background: #a5b4fc; }
.name-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Greeting */
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
  color: #818cf8;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-family: inherit;
}

/* Buttons */
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
.btn.primary {
  background: #818cf8;
  color: #0f0f1a;
  flex: 1;
  min-width: 160px;
}
.btn.primary:hover { background: #a5b4fc; }

.btn.demo {
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  color: #94a3b8;
  flex: 1;
  min-width: 140px;
}
.btn.demo:hover:not(:disabled) { border-color: #818cf8; color: #f1f5f9; }
.btn.demo:disabled { opacity: 0.5; cursor: not-allowed; }

.btn.secondary {
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  color: #94a3b8;
  padding: 12px 20px;
}
.btn.secondary:hover:not(:disabled) { border-color: #818cf8; color: #f1f5f9; }
.btn.secondary:disabled { opacity: 0.4; cursor: not-allowed; }

/* Join by code */
.join-code {
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: 600px;
}
.code-input {
  flex: 1;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
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
.code-input:focus { border-color: #818cf8; }
</style>
