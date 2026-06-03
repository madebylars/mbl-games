<template>
  <div class="lobby-list">
    <div class="list-header">
      <h3 class="list-title">Public Tables</h3>
      <button class="refresh-btn" :class="{ spinning: refreshing }" @click="$emit('refresh')">↻</button>
    </div>

    <div v-if="rooms.length === 0" class="empty">
      <p>No public tables yet.</p>
      <p class="empty-hint">Create one above to get started.</p>
    </div>

    <div v-else class="rooms">
      <div v-for="room in rooms" :key="room.id" class="room-row" @click="$emit('join', room.id)">
        <div class="room-info">
          <span class="room-name">{{ room.name }}</span>
          <span class="room-meta">{{ room.playerCount }}/{{ room.maxPlayers }} players · {{ phaseLabel(room.phase) }}</span>
        </div>
        <span class="room-code">{{ room.id }}</span>
        <button class="join-btn" @click.stop="$emit('join', room.id)">Join →</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PokerRoomSummary } from '../../../shared/types/poker'
import { PokerPhase } from '../../../shared/types/poker'

defineProps<{ rooms: PokerRoomSummary[]; refreshing: boolean }>()
defineEmits<{ join: [roomId: string]; refresh: [] }>()

function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    [PokerPhase.LOBBY]:    'Lobby',
    [PokerPhase.PREFLOP]:  'In Progress',
    [PokerPhase.FLOP]:     'In Progress',
    [PokerPhase.TURN]:     'In Progress',
    [PokerPhase.RIVER]:    'In Progress',
    [PokerPhase.SHOWDOWN]: 'Showdown',
    [PokerPhase.SCORES]:   'Between Hands',
    [PokerPhase.GAME_OVER]:'Game Over',
  }
  return labels[phase] ?? phase
}
</script>

<style scoped>
.lobby-list { width: 100%; max-width: 600px; }

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.list-title { font-size: 1rem; font-weight: 700; color: #94a3b8; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; }
.refresh-btn {
  background: none;
  border: 1px solid #2d4a2d;
  border-radius: 6px;
  color: #64748b;
  font-size: 1rem;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.refresh-btn:hover { border-color: #4ade80; color: #94a3b8; }
.refresh-btn.spinning { animation: spin 0.6s linear; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty { text-align: center; padding: 24px; color: #64748b; }
.empty-hint { font-size: 0.85rem; color: #475569; margin-top: 4px; }

.rooms { display: flex; flex-direction: column; gap: 8px; }

.room-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #111a11;
  border: 1px solid #1e3a1e;
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.room-row:hover { border-color: #4ade80; }

.room-info { flex: 1; }
.room-name { display: block; font-size: 0.95rem; font-weight: 700; color: #e2e8f0; }
.room-meta { display: block; font-size: 0.78rem; color: #64748b; margin-top: 2px; }

.room-code { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.12em; color: #4ade80; font-family: monospace; }

.join-btn {
  background: #16a34a;
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  color: #f0fff4;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
  font-family: inherit;
}
.join-btn:hover { background: #22c55e; }
</style>
