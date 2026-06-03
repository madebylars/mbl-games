<template>
  <div class="waiting">
    <div class="room-header">
      <h2 class="room-name">{{ room.config.name }}</h2>
      <div class="room-code">
        <span class="code-label">Room code</span>
        <span class="code-value">{{ room.id }}</span>
        <button class="copy-btn" :class="{ copied }" @click="copyCode">
          {{ copied ? '✓ Copied' : 'Copy' }}
        </button>
      </div>
    </div>

    <div class="config-summary">
      <span class="badge">{{ room.config.startingChips }} chips</span>
      <span class="badge">{{ room.config.smallBlind }}/{{ room.config.bigBlind }} blinds</span>
      <span class="badge">{{ room.config.turnTimerSeconds > 0 ? room.config.turnTimerSeconds + 's timer' : 'No timer' }}</span>
    </div>

    <div class="player-list">
      <div
        v-for="player in room.players"
        :key="player.id"
        class="player-row"
        :class="{ me: player.id === myPlayerId, bot: player.isBot }"
      >
        <span class="player-icon">{{ player.isBot ? '🤖' : '👤' }}</span>
        <span class="player-name">{{ player.name }}</span>
        <span v-if="player.isHost" class="badge host">Host</span>
        <span v-if="!player.connected && !player.isBot" class="badge disconnected">Away</span>
        <button
          v-if="isHost && !player.isHost && !player.isBot"
          class="kick-btn"
          @click="$emit('kick', player.id)"
        >
          Kick
        </button>
      </div>
    </div>

    <div class="actions">
      <button v-if="isHost" class="btn start" :disabled="room.players.length < 2" @click="$emit('start')">
        Start Game →
      </button>
      <p v-else class="waiting-msg">Waiting for host to start…</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PokerRoom } from '../../../shared/types/poker'

const props = defineProps<{
  room: PokerRoom
  myPlayerId: string
  isHost: boolean
}>()

defineEmits<{
  start: []
  kick: [playerId: string]
}>()

const copied = ref(false)

function copyCode() {
  navigator.clipboard.writeText(props.room.id).catch(() => {})
  copied.value = true
  setTimeout(() => { copied.value = false }, 2_000)
}
</script>

<style scoped>
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 520px;
  padding: 0 16px;
}

.room-header { text-align: center; }
.room-name { font-size: 1.6rem; font-weight: 800; color: #f1f5f9; margin: 0 0 12px; }

.room-code {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1a2e1a;
  border: 1px solid #2d4a2d;
  border-radius: 10px;
  padding: 10px 16px;
}
.code-label { font-size: 0.8rem; color: #64748b; }
.code-value { font-size: 1.3rem; font-weight: 800; letter-spacing: 0.2em; color: #4ade80; }
.copy-btn {
  background: #16a34a;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  color: #f0fff4;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.copy-btn.copied { background: #15803d; }

.config-summary { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }

.badge {
  background: #1e2e1e;
  border: 1px solid #2d4a2d;
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 0.8rem;
  color: #94a3b8;
}
.badge.host { background: #16a34a22; border-color: #16a34a; color: #4ade80; }
.badge.disconnected { background: #44444422; border-color: #888; color: #888; }

.player-list {
  width: 100%;
  background: #111a11;
  border: 1px solid #1e3a1e;
  border-radius: 14px;
  overflow: hidden;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #1e2e1e;
  transition: background 0.15s;
}
.player-row:last-child { border-bottom: none; }
.player-row.me { background: #0d2d0d; }
.player-icon { font-size: 1.1rem; }
.player-name { flex: 1; font-size: 1rem; color: #e2e8f0; }
.player-row.bot .player-name { color: #64748b; }

.kick-btn {
  background: none;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 3px 10px;
  color: #94a3b8;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.15s;
}
.kick-btn:hover { border-color: #ef4444; color: #ef4444; }

.actions { display: flex; justify-content: center; width: 100%; }

.btn.start {
  background: #16a34a;
  border: none;
  border-radius: 12px;
  padding: 14px 40px;
  color: #f0fff4;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.2s;
}
.btn.start:hover:not(:disabled) { background: #22c55e; }
.btn.start:disabled { opacity: 0.4; cursor: not-allowed; }

.waiting-msg { color: #64748b; font-size: 0.95rem; }
</style>
