<template>
  <div class="gameover">
    <div class="trophy">🏆</div>
    <h2 class="title">Game Over</h2>

    <div class="standings">
      <div
        v-for="(player, i) in finalStandings"
        :key="player.id"
        class="standing-row"
        :class="{ me: player.id === myPlayerId, winner: i === 0 }"
      >
        <span class="rank">{{ i + 1 }}</span>
        <span class="player-name">{{ player.name }}</span>
        <span class="chips">{{ player.chips.toLocaleString() }} chips</span>
        <span v-if="i === 0" class="crown">👑</span>
      </div>
    </div>

    <NuxtLink to="/games/poker" class="btn-back">← Back to Lobby</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { PokerPlayer } from '../../../shared/types/poker'
defineProps<{ finalStandings: PokerPlayer[]; myPlayerId: string }>()
</script>

<style scoped>
.gameover {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 40px 20px;
  width: 100%;
  max-width: 480px;
  text-align: center;
}

.trophy { font-size: 4rem; }
.title  { font-size: 2rem; font-weight: 800; color: #f1f5f9; margin: 0; }

.standings {
  width: 100%;
  background: #111a11;
  border: 1px solid #1e3a1e;
  border-radius: 14px;
  overflow: hidden;
}

.standing-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid #1e2e1e;
  transition: background 0.15s;
}
.standing-row:last-child { border-bottom: none; }
.standing-row.me     { background: #0d2d0d; }
.standing-row.winner { background: #1a2d0a; }

.rank { width: 24px; font-size: 0.85rem; font-weight: 800; color: #64748b; text-align: center; }
.standing-row.winner .rank { color: #fde047; }

.player-name { flex: 1; font-size: 1rem; font-weight: 600; color: #e2e8f0; text-align: left; }
.chips { font-size: 0.88rem; font-weight: 700; color: #4ade80; }
.crown { font-size: 1.1rem; }

.btn-back {
  margin-top: 8px;
  background: #16a34a;
  color: #f0fff4;
  border: none;
  border-radius: 12px;
  padding: 13px 32px;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s;
}
.btn-back:hover { background: #22c55e; }
</style>
