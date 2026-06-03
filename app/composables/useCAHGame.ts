/**
 * Primary game state composable.
 * Processes server messages into reactive state and exposes all game actions.
 */
import type {
  ClientGameState,
  Player,
  Room,
  CAHServerMessage,
  WhiteCard,
} from '../../shared/types/cah'
import { GamePhase } from '../../shared/types/cah'

// ── Player name helper — kept in localStorage ──────────────────────────────────
export function useCAHPlayerName() {
  const name = ref('')
  onMounted(() => { name.value = localStorage.getItem('cah-player-name') ?? '' })
  watch(name, (v) => { if (import.meta.client) localStorage.setItem('cah-player-name', v) })
  return name
}

// ── Main composable ────────────────────────────────────────────────────────────
export function useCAHGame(roomId: Ref<string> | string) {
  const playerName = useCAHPlayerName()
  const { playerId, status, lastMessage, send } = useCAHSocket(roomId, playerName)

  // ── Reactive game state ──────────────────────────────────────────────────
  const room          = ref<Room | null>(null)
  const myHand        = ref<WhiteCard[]>([])
  const cardIndex     = ref<Record<string, WhiteCard>>({})  // id → WhiteCard (from server)
  const selectedCards = ref<string[]>([])
  const timerSeconds  = ref(0)
  const error         = ref<string | null>(null)

  // ── Derived state ────────────────────────────────────────────────────────
  const myPlayer = computed<Player | null>(
    () => room.value?.players.find((p) => p.id === playerId.value) ?? null,
  )

  const currentRound = computed(() => room.value?.currentRound ?? null)

  const canPlayCards = computed(() => {
    if (room.value?.phase !== GamePhase.ANSWERING) return false
    if (myPlayer.value?.isCzar) return false
    if (!currentRound.value) return false
    return !currentRound.value.submissions.some((s) => s.playerId === playerId.value)
  })

  const canJudge = computed(
    () => room.value?.phase === GamePhase.JUDGING && myPlayer.value?.isCzar === true,
  )

  const hasSubmitted = computed(() =>
    currentRound.value?.submissions.some((s) => s.playerId === playerId.value) ?? false,
  )

  // ── Message processing ───────────────────────────────────────────────────
  watch(lastMessage, (msg) => { if (msg) handleMessage(msg) })

  function handleMessage(msg: CAHServerMessage) {
    switch (msg.type) {

      case 'WELCOME':
        // Server confirmed our join; STATE_UPDATE follows immediately
        break

      case 'STATE_UPDATE':
        applyFullState(msg.state)
        break

      case 'PLAYER_JOINED':
        if (room.value && !room.value.players.some((p) => p.id === msg.player.id)) {
          room.value.players.push(msg.player)
        }
        break

      case 'PLAYER_LEFT':
        if (room.value) {
          room.value.players = room.value.players.filter((p) => p.id !== msg.playerId)
        }
        break

      case 'PLAYER_DISCONNECTED':
        if (room.value) {
          const p = room.value.players.find((p) => p.id === msg.playerId)
          if (p) p.connected = false
        }
        break

      case 'PHASE_CHANGED':
        if (room.value) room.value.phase = msg.phase
        if (msg.round && room.value) room.value.currentRound = msg.round
        selectedCards.value = []
        timerSeconds.value = 0
        break

      case 'CARDS_PLAYED':
        // Lightweight notification — full state arrives in STATE_UPDATE shortly after
        break

      case 'SUBMISSION_REVEALED': {
        if (room.value?.currentRound) {
          const sub = room.value.currentRound.submissions[msg.index]
          if (sub) sub.revealed = true
          // Merge revealed card text into index
          for (const card of msg.cards) cardIndex.value[card.id] = card
        }
        break
      }

      case 'ROUND_WINNER':
        if (room.value?.currentRound) {
          room.value.currentRound.winnerId = msg.winnerId
          // Merge winning card text into index
          for (const card of msg.cards) cardIndex.value[card.id] = card
        }
        break

      case 'SCORES_UPDATE':
        if (room.value) room.value.players = msg.players
        break

      case 'TIMER_TICK':
        timerSeconds.value = msg.secondsLeft
        break

      case 'GAME_OVER':
        // Final STATE_UPDATE follows; nothing extra needed here
        break

      case 'ERROR':
        error.value = msg.message
        setTimeout(() => { error.value = null }, 4_000)
        break
    }
  }

  function applyFullState(state: ClientGameState) {
    room.value = state.room
    cardIndex.value = { ...cardIndex.value, ...state.cards }
    myHand.value = state.myHand
      .map((id) => state.cards[id])
      .filter((c): c is WhiteCard => c !== undefined)
    // Drop any selected cards that are no longer in hand
    selectedCards.value = selectedCards.value.filter((id) => state.myHand.includes(id))
  }

  // ── Card selection ───────────────────────────────────────────────────────
  function toggleCard(cardId: string) {
    if (!canPlayCards.value) return
    const pick = currentRound.value?.blackCard.pick ?? 1
    const idx = selectedCards.value.indexOf(cardId)
    if (idx >= 0) {
      selectedCards.value.splice(idx, 1)
    } else if (selectedCards.value.length < pick) {
      selectedCards.value.push(cardId)
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  const startGame       = () => send({ type: 'START_GAME' })
  const nextRound       = () => send({ type: 'NEXT_ROUND' })
  const kickPlayer      = (id: string) => send({ type: 'KICK_PLAYER', targetId: id })

  function playCards() {
    if (!canPlayCards.value || selectedCards.value.length === 0) return
    send({ type: 'PLAY_CARDS', cardIds: [...selectedCards.value] })
    selectedCards.value = []
  }

  function revealSubmission(index: number) {
    if (!canJudge.value) return
    send({ type: 'REVEAL_SUBMISSION', index })
  }

  function pickWinner(index: number) {
    if (!canJudge.value) return
    send({ type: 'PICK_WINNER', index })
  }

  return {
    // Identity
    playerId,
    playerName,
    // State
    room,
    myPlayer,
    myHand,
    cardIndex,
    currentRound,
    selectedCards,
    timerSeconds,
    canPlayCards,
    canJudge,
    hasSubmitted,
    error,
    status,
    // Actions
    toggleCard,
    playCards,
    revealSubmission,
    pickWinner,
    startGame,
    nextRound,
    kickPlayer,
  }
}
