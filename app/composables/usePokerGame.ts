/**
 * Primary game state composable for Texas Hold'em Poker.
 * Processes server messages into reactive state and exposes all game actions.
 */
import type { PokerClientState, PokerCard, PokerPlayer, PokerRoom, PokerServerMessage } from '../../shared/types/poker'
import { PokerPhase } from '../../shared/types/poker'

export function usePokerPlayerName() {
  const name = ref('')
  onMounted(() => { name.value = localStorage.getItem('poker-player-name') ?? '' })
  watch(name, (v) => { if (import.meta.client) localStorage.setItem('poker-player-name', v) })
  return name
}

export function usePokerGame(roomId: Ref<string> | string) {
  const playerName = usePokerPlayerName()
  const { playerId, status, lastMessage, send } = usePokerSocket(roomId, playerName)

  // ── Reactive state ───────────────────────────────────────────────────────
  const room         = ref<PokerRoom | null>(null)
  const myHoleCards  = ref<[PokerCard, PokerCard] | null>(null)
  const timerSeconds = ref(0)
  const error        = ref<string | null>(null)
  const raiseAmount  = ref(0)

  // ── Derived state ────────────────────────────────────────────────────────
  const myPlayer = computed<PokerPlayer | null>(
    () => room.value?.players.find((p) => p.id === playerId.value) ?? null,
  )

  const isMyTurn = computed(
    () => room.value?.activePlayerId === playerId.value,
  )

  const canAct = computed(
    () => isMyTurn.value && room.value != null &&
      [PokerPhase.PREFLOP, PokerPhase.FLOP, PokerPhase.TURN, PokerPhase.RIVER].includes(room.value.phase as PokerPhase),
  )

  const callAmount = computed(() => {
    if (!room.value || !myPlayer.value) return 0
    return Math.min(room.value.currentBet - myPlayer.value.currentBet, myPlayer.value.chips)
  })

  const canCheck = computed(() => {
    if (!room.value || !myPlayer.value) return false
    return room.value.currentBet === myPlayer.value.currentBet
  })

  const minRaise = computed(() => room.value?.minRaise ?? 0)
  const maxRaise = computed(() => {
    if (!myPlayer.value) return 0
    return myPlayer.value.chips + myPlayer.value.currentBet
  })

  const potTotal = computed(
    () => room.value?.pots.reduce((s, p) => s + p.amount, 0) ?? 0,
  )

  // ── Message handler ──────────────────────────────────────────────────────
  watch(lastMessage, (msg: PokerServerMessage | null) => {
    if (!msg) return

    switch (msg.type) {
      case 'STATE_UPDATE':
        applyState(msg.state)
        break
      case 'PHASE_CHANGED':
        if (room.value) room.value.phase = msg.phase
        timerSeconds.value = 0
        break
      case 'TIMER_TICK':
        timerSeconds.value = msg.secondsLeft
        break
      case 'PLAYER_ACTION':
        // State update will follow; nothing extra needed
        break
      case 'ERROR':
        if (msg.code !== 'KICKED' && msg.code !== 'BUSTED') error.value = msg.message
        break
      case 'GAME_OVER':
        break
    }
  })

  function applyState(state: PokerClientState) {
    const prevActiveId = room.value?.activePlayerId
    room.value        = state.room
    myHoleCards.value = state.myHoleCards
    // Clear timer when active player changes so the ring doesn't persist from the previous turn
    if (state.room.activePlayerId !== prevActiveId) timerSeconds.value = 0
    // Sync raise slider to min on new active turn
    if (state.room.activePlayerId === playerId.value) {
      raiseAmount.value = state.room.minRaise
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  function startGame() { send({ type: 'START_GAME' }) }
  function fold()      { send({ type: 'FOLD' }) }
  function check()     { send({ type: 'CHECK' }) }
  function call()      { send({ type: 'CALL' }) }
  function raise()     { send({ type: 'RAISE', amount: raiseAmount.value }) }
  function allIn()     { send({ type: 'ALL_IN' }) }

  function kickPlayer(targetId: string) { send({ type: 'KICK_PLAYER', targetId }) }

  function clearError() { error.value = null }

  return {
    playerName,
    playerId,
    status,
    room,
    myHoleCards,
    myPlayer,
    isMyTurn,
    canAct,
    canCheck,
    callAmount,
    minRaise,
    maxRaise,
    raiseAmount,
    potTotal,
    timerSeconds,
    error,
    startGame,
    fold,
    check,
    call,
    raise,
    allIn,
    kickPlayer,
    clearError,
  }
}
