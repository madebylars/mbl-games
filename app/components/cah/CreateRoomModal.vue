<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('close')">
      <div class="modal" role="dialog" aria-modal="true" aria-label="Create a game">

        <button class="close-btn" aria-label="Close" @click="$emit('close')">✕</button>
        <h2 class="modal-title">Create a Game</h2>

        <div class="field">
          <label class="label" for="room-name">Room name</label>
          <input
            id="room-name"
            v-model="form.name"
            class="input"
            type="text"
            maxlength="40"
            placeholder="e.g. Friday night chaos"
            @keydown.enter="submit"
          >
        </div>

        <div class="field">
          <label class="label">Visibility</label>
          <div class="toggle-row">
            <button
              class="toggle-btn"
              :class="{ active: form.isPublic }"
              @click="form.isPublic = true"
            >🌍 Public</button>
            <button
              class="toggle-btn"
              :class="{ active: !form.isPublic }"
              @click="form.isPublic = false"
            >🔒 Private</button>
          </div>
          <p class="hint">{{ form.isPublic ? 'Listed in the lobby — anyone can join.' : 'Hidden from the lobby — share the link to invite.' }}</p>
        </div>

        <div class="field">
          <label class="label">Points to win</label>
          <div class="toggle-row">
            <button
              v-for="pts in [5, 8, 10]"
              :key="pts"
              class="toggle-btn"
              :class="{ active: form.pointsToWin === pts }"
              @click="form.pointsToWin = pts"
            >{{ pts }}</button>
          </div>
        </div>

        <div class="field">
          <label class="label">Max players</label>
          <div class="toggle-row">
            <button
              v-for="n in [6, 8, 10]"
              :key="n"
              class="toggle-btn"
              :class="{ active: form.maxPlayers === n }"
              @click="form.maxPlayers = n"
            >{{ n }}</button>
          </div>
        </div>

        <div class="field">
          <label class="label">Language</label>
          <div class="toggle-row">
            <button
              class="toggle-btn"
              :class="{ active: form.lang === 'en' }"
              @click="form.lang = 'en'"
            >🇬🇧 English</button>
            <button
              class="toggle-btn"
              :class="{ active: form.lang === 'sv' }"
              @click="form.lang = 'sv'"
            >🇸🇪 Svenska</button>
          </div>
        </div>

        <div v-if="form.lang === 'sv'" class="field">
          <label class="label">Swedish pack</label>
          <div class="toggle-row">
            <button
              class="toggle-btn"
              :class="{ active: form.svPack === 'sv' }"
              @click="form.svPack = 'sv'"
            >🇸🇪 Standard</button>
            <button
              class="toggle-btn"
              :class="{ active: form.svPack === 'sv-xl' }"
              @click="form.svPack = 'sv-xl'"
            >🇸🇪<sup class="sv-badge">XL</sup> XL</button>
            <button
              class="toggle-btn"
              :class="{ active: form.svPack === 'sv-all' }"
              @click="form.svPack = 'sv-all'"
            >🇸🇪<sup class="sv-badge">∞</sup> Alla</button>
          </div>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <div class="actions">
          <button class="cancel-btn" @click="$emit('close')">Cancel</button>
          <button class="create-btn" :disabled="loading || !form.name.trim()" @click="submit">
            <span v-if="loading">Creating…</span>
            <span v-else>Create game →</span>
          </button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  close: []
  created: [roomId: string]
}>()

type SvPack = 'sv' | 'sv-xl' | 'sv-all'

const form = reactive({
  name: '',
  isPublic: true,
  pointsToWin: 8,
  maxPlayers: 10,
  lang: 'sv' as 'en' | 'sv',
  svPack: 'sv-all' as SvPack,
})

onMounted(() => {
  form.lang = (localStorage.getItem('cah-lang') as 'en' | 'sv') ?? 'sv'
  form.svPack = (localStorage.getItem('cah-sv-pack') as SvPack) ?? 'sv-all'
})

const activePacks = computed(() => {
  if (form.lang === 'en') return ['base']
  if (form.svPack === 'sv') return ['swedish']
  if (form.svPack === 'sv-xl') return ['swedish-xl']
  return ['swedish', 'swedish-xl']
})

const loading = ref(false)
const error = ref('')

async function submit() {
  if (!form.name.trim() || loading.value) return
  error.value = ''
  loading.value = true

  try {
    localStorage.setItem('cah-lang', form.lang)
    localStorage.setItem('cah-sv-pack', form.svPack)
    const data = await $fetch<{ roomId: string }>('/api/games/cah/rooms', {
      method: 'POST',
      body: {
        config: {
          name: form.name.trim(),
          isPublic: form.isPublic,
          pointsToWin: form.pointsToWin,
          maxPlayers: form.maxPlayers,
          packs: activePacks.value,
        },
        bots: 0,
      },
    })
    emit('created', data.roomId)
  } catch (e: unknown) {
    error.value = (e as Error)?.message ?? 'Could not create room. Try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.modal {
  position: relative;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 20px;
  padding: 36px 32px;
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #64748b;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: color 0.2s;
}
.close-btn:hover { color: #f1f5f9; }

.modal-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #f1f5f9;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #94a3b8;
}

.input {
  background: #0f0f1a;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  padding: 10px 14px;
  color: #f1f5f9;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s;
}
.input::placeholder { color: #475569; }
.input:focus { border-color: #818cf8; }

.toggle-row {
  display: flex;
  gap: 8px;
}
.sv-badge {
  font-size: 0.55rem;
  font-weight: 700;
  color: #818cf8;
  margin-left: 1px;
}

.toggle-btn {
  flex: 1;
  padding: 9px 12px;
  background: #0f0f1a;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.toggle-btn:hover { border-color: #818cf8; color: #f1f5f9; }
.toggle-btn.active {
  background: #1e1b4b;
  border-color: #818cf8;
  color: #818cf8;
}

.hint {
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.5;
}

.error-msg {
  color: #f87171;
  font-size: 0.9rem;
  padding: 10px 14px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.cancel-btn {
  flex: 1;
  padding: 12px;
  background: none;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #94a3b8;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.cancel-btn:hover { border-color: #94a3b8; color: #f1f5f9; }

.create-btn {
  flex: 2;
  padding: 12px;
  background: #818cf8;
  border: none;
  border-radius: 10px;
  color: #0f0f1a;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, opacity 0.15s;
}
.create-btn:hover:not(:disabled) { background: #a5b4fc; }
.create-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
