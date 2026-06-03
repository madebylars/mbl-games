<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <button class="close-btn" @click="$emit('close')">✕</button>
      <h2 class="modal-title">Create Table</h2>

      <div class="form">
        <label class="field">
          <span class="field-label">Table name</span>
          <input v-model="config.name" class="input" type="text" maxlength="40" placeholder="My Poker Table" />
        </label>

        <label class="field">
          <span class="field-label">Max players</span>
          <select v-model.number="config.maxPlayers" class="input">
            <option v-for="n in [2,3,4,5,6,7,8,9]" :key="n" :value="n">{{ n }} players</option>
          </select>
        </label>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Small blind</span>
            <input v-model.number="config.smallBlind" class="input" type="number" min="1" max="500" />
          </label>
          <label class="field">
            <span class="field-label">Big blind</span>
            <input v-model.number="config.bigBlind" class="input" type="number" min="2" max="1000" />
          </label>
        </div>

        <label class="field">
          <span class="field-label">Starting chips</span>
          <input v-model.number="config.startingChips" class="input" type="number" min="100" max="100000" step="100" />
        </label>

        <label class="field">
          <span class="field-label">Turn timer (0 = no limit)</span>
          <select v-model.number="config.turnTimerSeconds" class="input">
            <option :value="0">No timer</option>
            <option :value="15">15 seconds</option>
            <option :value="20">20 seconds</option>
            <option :value="30">30 seconds</option>
            <option :value="45">45 seconds</option>
            <option :value="60">60 seconds</option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Bots at table</span>
          <select v-model.number="bots" class="input">
            <option :value="0">No bots</option>
            <option v-for="n in [1,2,3,4,5,6,7]" :key="n" :value="n">{{ n }} bot{{ n > 1 ? 's' : '' }}</option>
          </select>
        </label>

        <label class="field toggle-field">
          <span class="field-label">Public table</span>
          <input v-model="config.isPublic" type="checkbox" class="toggle" />
        </label>
      </div>

      <div class="modal-actions">
        <button class="btn cancel" @click="$emit('close')">Cancel</button>
        <button class="btn create" :disabled="creating" @click="createRoom">
          {{ creating ? 'Creating…' : 'Create Table →' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PokerRoomConfig } from '../../../shared/types/poker'

const props = defineProps<{ playerName: string }>()
const emit  = defineEmits<{ close: []; created: [roomId: string] }>()

const creating = ref(false)
const bots     = ref(0)

const config = reactive<Partial<PokerRoomConfig>>({
  name:             `${props.playerName}'s Table`,
  maxPlayers:       6,
  isPublic:         true,
  startingChips:    1000,
  smallBlind:       10,
  bigBlind:         20,
  turnTimerSeconds: 30,
})

async function createRoom() {
  if (creating.value) return
  creating.value = true
  try {
    const data = await $fetch<{ roomId: string }>('/api/games/poker/rooms', {
      method: 'POST',
      body: { config, bots: bots.value },
    })
    emit('created', data.roomId)
  } catch { /* swallow */ }
  finally { creating.value = false }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal {
  background: #0d1a0d;
  border: 1px solid #2d4a2d;
  border-radius: 16px;
  padding: 28px;
  width: 100%;
  max-width: 440px;
  position: relative;
  max-height: 90vh;
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #64748b;
  font-size: 1rem;
  cursor: pointer;
  padding: 4px;
}
.close-btn:hover { color: #94a3b8; }

.modal-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #f1f5f9;
  margin: 0 0 20px;
}

.form { display: flex; flex-direction: column; gap: 14px; }

.field { display: flex; flex-direction: column; gap: 5px; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }

.toggle-field { flex-direction: row; align-items: center; justify-content: space-between; }

.field-label { font-size: 0.82rem; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }

.input {
  background: #1a2e1a;
  border: 1px solid #2d4a2d;
  border-radius: 8px;
  padding: 10px 12px;
  color: #f1f5f9;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.input:focus { border-color: #4ade80; }
select.input { cursor: pointer; }

.toggle {
  width: 40px;
  height: 22px;
  cursor: pointer;
  accent-color: #16a34a;
}

.modal-actions { display: flex; gap: 10px; margin-top: 20px; }

.btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.btn.cancel { background: #1e2e1e; border: 1px solid #2d4a2d; color: #94a3b8; }
.btn.cancel:hover { border-color: #4ade80; color: #f1f5f9; }
.btn.create { background: #16a34a; color: #f0fff4; }
.btn.create:hover:not(:disabled) { background: #22c55e; }
.btn.create:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
