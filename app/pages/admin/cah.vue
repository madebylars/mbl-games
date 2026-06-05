<template>
  <div class="page">

    <!-- Not logged in -->
    <div v-if="!user" class="gate">
      <p>You must be logged in as an admin to access this page.</p>
    </div>

    <!-- Logged in but not admin -->
    <div v-else-if="!isAdmin" class="gate">
      <p>Your account does not have admin access.</p>
    </div>

    <!-- Admin UI -->
    <template v-else>
      <header class="page-header">
        <h1 class="page-title">CAH Card Manager</h1>
        <p class="page-sub">Custom cards are merged with the static packs at game start.</p>
      </header>

      <!-- Filters -->
      <div class="toolbar">
        <div class="filter-group">
          <label class="filter-label">Pack</label>
          <select v-model="filterPack" class="select">
            <option value="">All packs</option>
            <option v-for="p in availablePacks" :key="p" :value="p">{{ p }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">Type</label>
          <div class="toggle-row">
            <button class="toggle-btn" :class="{ active: filterType === '' }" @click="filterType = ''">All</button>
            <button class="toggle-btn" :class="{ active: filterType === 'black' }" @click="filterType = 'black'">Black</button>
            <button class="toggle-btn" :class="{ active: filterType === 'white' }" @click="filterType = 'white'">White</button>
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label">Search</label>
          <input v-model="search" class="input" placeholder="Search text…" />
        </div>
        <button class="add-btn" @click="openAdd">+ Add card</button>
      </div>

      <!-- Status line -->
      <div v-if="statusMsg" class="status-bar" :class="statusType">{{ statusMsg }}</div>

      <!-- Card table -->
      <div class="table-wrap">
        <table class="card-table">
          <thead>
            <tr>
              <th>Pack</th>
              <th>Type</th>
              <th>Text</th>
              <th>Pick</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="empty-row">Loading…</td>
            </tr>
            <tr v-else-if="filtered.length === 0">
              <td colspan="5" class="empty-row">No cards found.</td>
            </tr>
            <template v-else>
              <tr
                v-for="card in filtered"
                :key="card.id"
                :class="['card-row', card.type]"
              >
                <!-- Viewing mode -->
                <template v-if="editingId !== card.id">
                  <td class="td-pack">{{ card.pack }}</td>
                  <td class="td-type"><span class="type-badge" :class="card.type">{{ card.type }}</span></td>
                  <td class="td-text">{{ card.text }}</td>
                  <td class="td-pick">{{ card.type === 'black' ? card.pick : '—' }}</td>
                  <td class="td-actions">
                    <button class="icon-btn edit" title="Edit" @click="startEdit(card)">✏️</button>
                    <button class="icon-btn delete" title="Delete" @click="confirmDelete(card)">🗑️</button>
                  </td>
                </template>
                <!-- Editing mode -->
                <template v-else>
                  <td><input v-model="editForm.pack" class="input small" /></td>
                  <td>
                    <select v-model="editForm.type" class="select small" @change="editForm.pick = 1">
                      <option value="black">black</option>
                      <option value="white">white</option>
                    </select>
                  </td>
                  <td><input v-model="editForm.text" class="input small wide" /></td>
                  <td>
                    <select v-if="editForm.type === 'black'" v-model.number="editForm.pick" class="select small">
                      <option :value="1">1</option>
                      <option :value="2">2</option>
                      <option :value="3">3</option>
                    </select>
                    <span v-else>—</span>
                  </td>
                  <td class="td-actions">
                    <button class="icon-btn save" title="Save" :disabled="saving" @click="saveEdit(card.id)">💾</button>
                    <button class="icon-btn cancel" title="Cancel" @click="editingId = null">✕</button>
                  </td>
                </template>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Add card modal -->
      <Teleport to="body">
        <div v-if="showAdd" class="overlay" @click.self="showAdd = false">
          <div class="modal" role="dialog" aria-modal="true" aria-label="Add card">
            <button class="close-btn" @click="showAdd = false">✕</button>
            <h2 class="modal-title">Add card</h2>

            <div class="field">
              <label class="label">Pack</label>
              <input v-model="addForm.pack" class="input" placeholder="e.g. base, swedish, custom…" list="pack-suggestions" />
              <datalist id="pack-suggestions">
                <option v-for="p in availablePacks" :key="p" :value="p" />
              </datalist>
            </div>

            <div class="field">
              <label class="label">Type</label>
              <div class="toggle-row">
                <button class="toggle-btn" :class="{ active: addForm.type === 'black' }" @click="addForm.type = 'black'; addForm.pick = 1">Black card</button>
                <button class="toggle-btn" :class="{ active: addForm.type === 'white' }" @click="addForm.type = 'white'">White card</button>
              </div>
            </div>

            <div class="field">
              <label class="label">Text <span v-if="addForm.type === 'black'" class="hint-inline">(use _ for each blank)</span></label>
              <textarea v-model="addForm.text" class="textarea" rows="3" placeholder="Card text…" />
            </div>

            <div v-if="addForm.type === 'black'" class="field">
              <label class="label">Pick (number of blanks)</label>
              <div class="toggle-row">
                <button v-for="n in [1, 2, 3]" :key="n" class="toggle-btn" :class="{ active: addForm.pick === n }" @click="addForm.pick = n">{{ n }}</button>
              </div>
            </div>

            <p v-if="addError" class="error-msg">{{ addError }}</p>

            <div class="actions">
              <button class="cancel-btn" @click="showAdd = false">Cancel</button>
              <button class="create-btn" :disabled="saving || !addForm.text.trim() || !addForm.pack.trim()" @click="submitAdd">
                <span v-if="saving">Saving…</span>
                <span v-else>Add card</span>
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Delete confirmation modal -->
      <Teleport to="body">
        <div v-if="deleteTarget" class="overlay" @click.self="deleteTarget = null">
          <div class="modal confirm-modal" role="dialog">
            <h2 class="modal-title">Delete card?</h2>
            <p class="confirm-text">{{ deleteTarget.text }}</p>
            <div class="actions">
              <button class="cancel-btn" @click="deleteTarget = null">Cancel</button>
              <button class="delete-confirm-btn" :disabled="saving" @click="doDelete">
                <span v-if="saving">Deleting…</span>
                <span v-else>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </Teleport>

    </template>
  </div>
</template>

<script setup lang="ts">
// mbl-auth sets these state keys via its Nuxt plugin when running in the parent app.
const user = useState<any>('supabase.user')
const session = useState<any>('supabase.session')

const isAdmin = computed(() => user.value?.app_metadata?.role === 'admin')
const token = computed<string | null>(() => session.value?.access_token ?? null)

// ── State ──────────────────────────────────────────────────────────────────────

interface Card {
  id: string
  pack: string
  type: 'black' | 'white'
  text: string
  pick: number
  created_at: string
}

const cards = ref<Card[]>([])
const availablePacks = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
const filterPack = ref('')
const filterType = ref('')
const search = ref('')
const editingId = ref<string | null>(null)
const editForm = reactive({ pack: '', type: 'black' as 'black' | 'white', text: '', pick: 1 })
const showAdd = ref(false)
const addForm = reactive({ pack: '', type: 'black' as 'black' | 'white', text: '', pick: 1 })
const addError = ref('')
const deleteTarget = ref<Card | null>(null)
const statusMsg = ref('')
const statusType = ref<'ok' | 'err'>('ok')

// ── Computed ───────────────────────────────────────────────────────────────────

const filtered = computed(() => {
  let list = cards.value
  if (filterPack.value) list = list.filter((c) => c.pack === filterPack.value)
  if (filterType.value) list = list.filter((c) => c.type === filterType.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter((c) => c.text.toLowerCase().includes(q))
  }
  return list
})

// ── API helpers ────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return token.value ? { Authorization: `Bearer ${token.value}` } : {}
}

async function fetchCards() {
  loading.value = true
  try {
    const data = await $fetch<Card[]>('/api/admin/cah/cards', { headers: authHeaders() })
    cards.value = data
  } finally {
    loading.value = false
  }
}

async function fetchPacks() {
  const { packs } = await $fetch<{ packs: string[] }>('/api/admin/cah/packs')
  availablePacks.value = packs
}

// ── Add card ───────────────────────────────────────────────────────────────────

function openAdd() {
  addForm.pack = filterPack.value || (availablePacks.value[0] ?? '')
  addForm.type = (filterType.value as 'black' | 'white') || 'white'
  addForm.text = ''
  addForm.pick = 1
  addError.value = ''
  showAdd.value = true
}

async function submitAdd() {
  if (!addForm.text.trim() || !addForm.pack.trim()) return
  saving.value = true
  addError.value = ''
  try {
    const card = await $fetch<Card>('/api/admin/cah/cards', {
      method: 'POST',
      headers: authHeaders(),
      body: { ...addForm },
    })
    cards.value.push(card)
    if (!availablePacks.value.includes(card.pack)) availablePacks.value.push(card.pack)
    showAdd.value = false
    showStatus('Card added.', 'ok')
  } catch (e: any) {
    addError.value = e?.data?.statusMessage ?? 'Could not add card.'
  } finally {
    saving.value = false
  }
}

// ── Edit card ──────────────────────────────────────────────────────────────────

function startEdit(card: Card) {
  editingId.value = card.id
  editForm.pack = card.pack
  editForm.type = card.type
  editForm.text = card.text
  editForm.pick = card.pick
}

async function saveEdit(id: string) {
  saving.value = true
  try {
    const updated = await $fetch<Card>(`/api/admin/cah/cards/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: { ...editForm },
    })
    const idx = cards.value.findIndex((c) => c.id === id)
    if (idx !== -1) cards.value[idx] = updated
    editingId.value = null
    showStatus('Card saved.', 'ok')
  } catch (e: any) {
    showStatus(e?.data?.statusMessage ?? 'Save failed.', 'err')
  } finally {
    saving.value = false
  }
}

// ── Delete card ────────────────────────────────────────────────────────────────

function confirmDelete(card: Card) {
  deleteTarget.value = card
}

async function doDelete() {
  if (!deleteTarget.value) return
  saving.value = true
  const id = deleteTarget.value.id
  try {
    await $fetch(`/api/admin/cah/cards/${id}`, { method: 'DELETE', headers: authHeaders() })
    cards.value = cards.value.filter((c) => c.id !== id)
    deleteTarget.value = null
    showStatus('Card deleted.', 'ok')
  } catch (e: any) {
    showStatus(e?.data?.statusMessage ?? 'Delete failed.', 'err')
    deleteTarget.value = null
  } finally {
    saving.value = false
  }
}

// ── Status flash ───────────────────────────────────────────────────────────────

let statusTimer: ReturnType<typeof setTimeout> | null = null
function showStatus(msg: string, type: 'ok' | 'err') {
  statusMsg.value = msg
  statusType.value = type
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => { statusMsg.value = '' }, 3000)
}

// ── Init ───────────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!isAdmin.value) return
  await Promise.all([fetchCards(), fetchPacks()])
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #0f0f1a;
  color: #f1f5f9;
  font-family: inherit;
  padding: 32px 24px;
  max-width: 1100px;
  margin: 0 auto;
}

.gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  color: #64748b;
  font-size: 1.1rem;
}

.page-header { margin-bottom: 28px; }
.page-title { font-size: 1.7rem; font-weight: 700; margin: 0 0 6px; }
.page-sub { color: #64748b; font-size: 0.9rem; margin: 0; }

/* Toolbar */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  margin-bottom: 20px;
}
.filter-group { display: flex; flex-direction: column; gap: 6px; }
.filter-label {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #94a3b8;
}

.select, .input {
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  padding: 8px 12px;
  color: #f1f5f9;
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  min-width: 130px;
}
.select:focus, .input:focus { border-color: #818cf8; }
.input::placeholder { color: #475569; }

.toggle-row { display: flex; gap: 6px; }
.toggle-btn {
  padding: 7px 14px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 7px;
  color: #94a3b8;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.toggle-btn:hover { border-color: #818cf8; color: #f1f5f9; }
.toggle-btn.active { background: #1e1b4b; border-color: #818cf8; color: #818cf8; }

.add-btn {
  margin-left: auto;
  padding: 9px 20px;
  background: #818cf8;
  border: none;
  border-radius: 8px;
  color: #0f0f1a;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  align-self: flex-end;
  transition: background 0.15s;
}
.add-btn:hover { background: #a5b4fc; }

/* Status bar */
.status-bar {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 14px;
}
.status-bar.ok { background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); color: #4ade80; }
.status-bar.err { background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.3); color: #f87171; }

/* Table */
.table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid #2d2d44; }
.card-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.card-table thead tr {
  background: #1e1e2e;
  border-bottom: 1px solid #2d2d44;
}
.card-table th {
  padding: 12px 14px;
  text-align: left;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
}
.card-table tbody tr {
  border-bottom: 1px solid #1e1e2e;
  transition: background 0.1s;
}
.card-table tbody tr:last-child { border-bottom: none; }
.card-table tbody tr:hover { background: #1a1a2e; }
.card-table td { padding: 11px 14px; vertical-align: middle; }

.empty-row { text-align: center; color: #475569; padding: 32px 0 !important; }

.td-pack { color: #94a3b8; font-size: 0.85rem; white-space: nowrap; }
.td-type { white-space: nowrap; }
.td-text { max-width: 480px; line-height: 1.4; }
.td-pick { text-align: center; color: #94a3b8; }
.td-actions { white-space: nowrap; text-align: right; }

.type-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}
.type-badge.black { background: #0f0f0f; border: 1px solid #374151; color: #e2e8f0; }
.type-badge.white { background: #f8fafc; border: 1px solid #e2e8f0; color: #0f0f1a; }

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 1rem;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}
.icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.06); }
.icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.input.small { padding: 5px 9px; font-size: 0.85rem; min-width: 0; }
.input.wide { min-width: 260px; }
.select.small { padding: 5px 9px; font-size: 0.85rem; min-width: 0; }

/* Modal */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
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
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.confirm-modal { max-width: 380px; }
.close-btn {
  position: absolute;
  top: 14px; right: 14px;
  background: none; border: none;
  color: #64748b; font-size: 1.1rem;
  cursor: pointer; padding: 4px 8px;
  border-radius: 6px;
}
.close-btn:hover { color: #f1f5f9; }
.modal-title { font-size: 1.3rem; font-weight: 700; color: #f1f5f9; margin: 0; }

.field { display: flex; flex-direction: column; gap: 8px; }
.label {
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}
.hint-inline { text-transform: none; letter-spacing: 0; font-weight: 400; color: #64748b; }
.textarea {
  background: #0f0f1a;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  padding: 10px 14px;
  color: #f1f5f9;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
  resize: vertical;
  transition: border-color 0.2s;
}
.textarea:focus { border-color: #818cf8; }
.textarea::placeholder { color: #475569; }

.error-msg {
  color: #f87171;
  font-size: 0.87rem;
  padding: 8px 12px;
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 8px;
}

.confirm-text {
  color: #94a3b8;
  font-size: 0.95rem;
  line-height: 1.5;
  padding: 10px 14px;
  background: #0f0f1a;
  border-radius: 8px;
  border: 1px solid #2d2d44;
}

.actions { display: flex; gap: 12px; margin-top: 4px; }
.cancel-btn {
  flex: 1; padding: 11px;
  background: none;
  border: 1px solid #2d2d44;
  border-radius: 10px;
  color: #94a3b8;
  font-size: 0.9rem; font-weight: 600;
  cursor: pointer; transition: all 0.15s;
}
.cancel-btn:hover { border-color: #94a3b8; color: #f1f5f9; }
.create-btn {
  flex: 2; padding: 11px;
  background: #818cf8; border: none;
  border-radius: 10px;
  color: #0f0f1a;
  font-size: 0.9rem; font-weight: 700;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.create-btn:hover:not(:disabled) { background: #a5b4fc; }
.create-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.delete-confirm-btn {
  flex: 2; padding: 11px;
  background: #ef4444; border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 0.9rem; font-weight: 700;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
}
.delete-confirm-btn:hover:not(:disabled) { background: #f87171; }
.delete-confirm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
