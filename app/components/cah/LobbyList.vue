<template>
  <div class="lobby-list">
    <div class="list-header">
      <h2 class="list-title">Public Games</h2>
      <button class="refresh-btn" :class="{ spinning: refreshing }" title="Refresh" @click="$emit('refresh')">↻</button>
    </div>

    <div v-if="rooms.length === 0" class="empty">
      <span class="empty-icon">🃏</span>
      <p>No public games right now.<br>Create one and invite friends!</p>
    </div>

    <ul v-else class="rooms">
      <li v-for="room in rooms" :key="room.id" class="room-row">
        <div class="room-info">
          <span class="room-name">{{ room.name }}</span>
          <span class="room-meta">
            {{ room.playerCount }}/{{ room.maxPlayers }} players
            <span v-if="room.phase !== 'LOBBY'" class="badge in-progress">In progress</span>
            <span v-else class="badge open">Open</span>
          </span>
        </div>
        <button
          class="join-btn"
          :disabled="room.phase !== 'LOBBY' || room.playerCount >= room.maxPlayers"
          @click="$emit('join', room.id)"
        >
          Join →
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { PublicRoomSummary } from '../../../shared/types/core'

defineProps<{
  rooms: PublicRoomSummary[]
  refreshing?: boolean
}>()

defineEmits<{
  join: [roomId: string]
  refresh: []
}>()
</script>

<style scoped>
.lobby-list {
  width: 100%;
  max-width: 600px;
}

.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.list-title {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #94a3b8;
}

.refresh-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s, transform 0.4s;
}
.refresh-btn:hover { color: #818cf8; }
.refresh-btn.spinning { animation: spin 0.6s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  color: #64748b;
  text-align: center;
  border: 1px dashed #2d2d44;
  border-radius: 12px;
  font-size: 0.95rem;
  line-height: 1.6;
}
.empty-icon { font-size: 2.5rem; }

.rooms {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.room-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 12px;
  transition: border-color 0.2s;
}
.room-row:hover { border-color: #818cf8; }

.room-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.room-name {
  font-weight: 600;
  font-size: 1rem;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #64748b;
}

.badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.badge.open        { background: #14532d; color: #4ade80; }
.badge.in-progress { background: #1e1b4b; color: #818cf8; }

.join-btn {
  flex-shrink: 0;
  padding: 8px 20px;
  background: #818cf8;
  color: #0f0f1a;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
}
.join-btn:hover:not(:disabled) { background: #a5b4fc; }
.join-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
