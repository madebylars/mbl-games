/**
 * Texas Hold'em Poker — WebSocket handler & game state machine
 *
 * Endpoint: ws(s)://host/games/poker/ws?roomId=XXXXXX&playerId=...&name=...
 */
import { customAlphabet } from 'nanoid'
import type { PokerClientMessage, PokerPlayer } from '../../../../shared/types/poker'
import { PokerPhase as Phase } from '../../../../shared/types/poker'
import type { RoomState } from '../../../games/poker/roomStore'
import {
  addPlayer,
  broadcast,
  broadcastStateToAll,
  buildActionQueue,
  buildClientState,
  clearAllTimers,
  clearTimerByKey,
  collectStreetBets,
  computeShowdownPots,
  dealNewHand,
  deleteRoom,
  disconnectPlayer,
  getRoom,
  rebuildQueueAfterRaise,
  reconnectPlayer,
  removePlayer,
  sendPeer,
  setInterval_,
  setPhase,
  setTimer,
  unicast,
} from '../../../games/poker/roomStore'
import { evaluateBestHand, preflopStrength } from '../../../utils/pokerHandEvaluator'

const genPlayerId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

const RECONNECT_GRACE_MS  = 30_000
const SCORES_PAUSE_MS     = 4_000
const BOT_ACTION_MIN_MS   = 150
const BOT_ACTION_RANGE_MS = 350

const peerMeta = new Map<string, { roomId: string; playerId: string }>()

// ── URL parsing ────────────────────────────────────────────────────────────────

function parseParams(peer: { request?: { url?: string } | null }) {
  const raw = peer.request?.url ?? '/'
  let url: URL
  try { url = raw.startsWith('http') ? new URL(raw) : new URL(`http://x${raw}`) }
  catch { url = new URL('http://x/') }
  return {
    roomId:     url.searchParams.get('roomId') ?? '',
    playerId:   url.searchParams.get('playerId') ?? '',
    playerName: decodeURIComponent(url.searchParams.get('name') ?? 'Player').slice(0, 32),
  }
}

// ── WebSocket lifecycle ────────────────────────────────────────────────────────

export default defineWebSocketHandler({

  async open(peer) {
    const { roomId, playerId: rawId, playerName } = parseParams(peer)
    const playerId = rawId || genPlayerId()

    const state = getRoom(roomId)
    if (!state) {
      sendPeer(peer, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found.' })
      peer.close()
      return
    }

    peerMeta.set(peer.id, { roomId, playerId })

    // Reconnecting player
    const existing = state.room.players.find((p) => p.id === playerId)
    if (existing) {
      clearTimerByKey(state, `remove-${playerId}`)
      const player = reconnectPlayer(state, peer, playerId)
      if (!player) {
        sendPeer(peer, { type: 'ERROR', code: 'JOIN_FAILED', message: 'Could not reconnect.' })
        peer.close()
        return
      }
      sendPeer(peer, { type: 'WELCOME', playerId, roomId })
      unicast(state, playerId, { type: 'STATE_UPDATE', state: buildClientState(state, playerId) })
      broadcast(state, { type: 'PLAYER_JOINED', player }, playerId)
      return
    }

    // New player
    if (state.room.players.filter((p) => !p.isBot).length >= state.room.config.maxPlayers) {
      sendPeer(peer, { type: 'ERROR', code: 'ROOM_FULL', message: 'This room is full.' })
      peer.close()
      return
    }
    if (state.room.phase !== Phase.LOBBY) {
      sendPeer(peer, { type: 'ERROR', code: 'GAME_IN_PROGRESS', message: 'A game is already in progress.' })
      peer.close()
      return
    }

    const player = addPlayer(state, peer, playerId, playerName)
    sendPeer(peer, { type: 'WELCOME', playerId, roomId })
    unicast(state, playerId, { type: 'STATE_UPDATE', state: buildClientState(state, playerId) })
    broadcast(state, { type: 'PLAYER_JOINED', player }, playerId)
  },

  async message(peer, msg) {
    const meta = peerMeta.get(peer.id)
    if (!meta) return
    const { roomId, playerId } = meta

    const state = getRoom(roomId)
    if (!state) return

    let parsed: PokerClientMessage
    try { parsed = JSON.parse(msg.text()) as PokerClientMessage }
    catch { return }

    switch (parsed.type) {
      case 'PING':         unicast(state, playerId, { type: 'PONG' }); break
      case 'START_GAME':   handleStartGame(state, playerId); break
      case 'FOLD':         handleAction(state, playerId, 'fold'); break
      case 'CHECK':        handleAction(state, playerId, 'check'); break
      case 'CALL':         handleAction(state, playerId, 'call'); break
      case 'RAISE':        handleAction(state, playerId, 'raise', parsed.amount); break
      case 'ALL_IN':       handleAction(state, playerId, 'all_in'); break
      case 'KICK_PLAYER':  handleKickPlayer(state, playerId, parsed.targetId); break
      case 'LEAVE_ROOM':   handleLeave(state, playerId); break
    }
  },

  async close(peer) {
    const meta = peerMeta.get(peer.id)
    peerMeta.delete(peer.id)
    if (!meta) return

    const { roomId, playerId } = meta
    const state = getRoom(roomId)
    if (!state) return

    disconnectPlayer(state, playerId)
    broadcast(state, { type: 'PLAYER_DISCONNECTED', playerId })

    setTimer(state, `remove-${playerId}`, () => {
      const s = getRoom(roomId)
      if (!s) return
      const p = s.room.players.find((pl) => pl.id === playerId)
      if (p && !p.connected) handlePlayerGone(s, playerId)
    }, RECONNECT_GRACE_MS)
  },

  async error(peer, error) {
    console.error('[Poker WS]', peer.id, error)
  },
})

// ── Start game ─────────────────────────────────────────────────────────────────

function handleStartGame(state: RoomState, playerId: string) {
  const player = state.room.players.find((p) => p.id === playerId)
  if (!player?.isHost || state.room.phase !== Phase.LOBBY) return

  const total = state.room.players.length
  if (total < 2) {
    unicast(state, playerId, { type: 'ERROR', code: 'NOT_ENOUGH_PLAYERS', message: 'Need at least 2 players to start.' })
    return
  }

  // Set initial dealer to the first player (will be advanced in dealNewHand)
  if (!state.dealerPlayerId) state.dealerPlayerId = state.room.players[0]!.id

  startNewHand(state)
}

// ── Hand lifecycle ─────────────────────────────────────────────────────────────

function startNewHand(state: RoomState) {
  clearAllTimers(state)
  dealNewHand(state)
  setPhase(state, Phase.PREFLOP)
  startBettingRound(state, 'preflop')
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.PREFLOP })
}

function startBettingRound(state: RoomState, street: 'preflop' | 'flop' | 'turn' | 'river') {
  // Reset per-street bets (except blinds already posted for preflop)
  if (street !== 'preflop') {
    for (const p of state.room.players) p.currentBet = 0
    state.room.currentBet = 0
    state.room.minRaise   = state.room.config.bigBlind
  }

  const eligible = state.room.players.filter((p) => p.chips > 0 || p.allIn)

  // Find the player who acts LAST (so queue starts after them)
  let lastActorId: string
  if (street === 'preflop') {
    // BB acts last preflop
    lastActorId = eligible.find((p) => p.isBigBlind)?.id ?? state.dealerPlayerId
  } else {
    // Dealer acts last post-flop
    lastActorId = state.dealerPlayerId
  }

  state.actionQueue = buildActionQueue(state, lastActorId)

  // If fewer than 2 can act, auto-run board (all-in situation)
  const canAct = state.actionQueue.length
  if (canAct === 0) {
    // No one to act — deal out remaining streets
    autoRunBoard(state)
    return
  }

  // Set active player and start their timer
  state.room.activePlayerId = state.actionQueue[0]!
  startTurnTimer(state, state.room.activePlayerId)
  scheduleBotActionIfNeeded(state)
}

function autoRunBoard(state: RoomState) {
  // Collect any remaining bets and advance through remaining streets without betting
  collectStreetBets(state)

  const phase = state.room.phase
  if (phase === Phase.PREFLOP) {
    dealFlop(state)
    setPhase(state, Phase.FLOP)
    broadcastStateToAll(state)
    setTimer(state, 'auto-board', () => {
      const s = getRoom(state.room.id)
      if (!s) return
      dealTurn(s)
      setPhase(s, Phase.TURN)
      broadcastStateToAll(s)
      setTimer(s, 'auto-board', () => {
        const s2 = getRoom(s.room.id)
        if (!s2) return
        dealRiver(s2)
        setPhase(s2, Phase.RIVER)
        broadcastStateToAll(s2)
        setTimer(s2, 'auto-board', () => {
          const s3 = getRoom(s2.room.id)
          if (s3) handleShowdown(s3)
        }, 1_500)
      }, 1_500)
    }, 1_500)
  } else if (phase === Phase.FLOP) {
    dealTurn(state)
    setPhase(state, Phase.TURN)
    broadcastStateToAll(state)
    setTimer(state, 'auto-board', () => {
      const s = getRoom(state.room.id)
      if (!s) return
      dealRiver(s)
      setPhase(s, Phase.RIVER)
      broadcastStateToAll(s)
      setTimer(s, 'auto-board', () => {
        const s2 = getRoom(s.room.id)
        if (s2) handleShowdown(s2)
      }, 1_500)
    }, 1_500)
  } else if (phase === Phase.TURN) {
    dealRiver(state)
    setPhase(state, Phase.RIVER)
    broadcastStateToAll(state)
    setTimer(state, 'auto-board', () => {
      const s = getRoom(state.room.id)
      if (s) handleShowdown(s)
    }, 1_500)
  } else if (phase === Phase.RIVER) {
    handleShowdown(state)
  }
}

// ── Betting actions ────────────────────────────────────────────────────────────

function handleAction(state: RoomState, playerId: string, action: 'fold' | 'check' | 'call' | 'raise' | 'all_in', raiseAmount?: number) {
  if (state.room.activePlayerId !== playerId) return

  // Clear timers immediately — even if we bail below, we don't want a stale
  // turn timer firing later and auto-folding someone.
  clearTimerByKey(state, 'turnTimer')
  clearTimerByKey(state, 'bot-action')

  const bettingPhases: string[] = [Phase.PREFLOP, Phase.FLOP, Phase.TURN, Phase.RIVER]
  if (!bettingPhases.includes(state.room.phase)) return

  const player = state.room.players.find((p) => p.id === playerId)
  // If player is all-in or folded they shouldn't be in the queue — advance past them.
  if (!player || player.folded || player.allIn) {
    state.actionQueue = state.actionQueue.filter((id) => id !== playerId)
    advanceAction(state)
    return
  }

  const { currentBet: roomBet, config: { bigBlind } } = state.room
  const toCall = roomBet - player.currentBet

  switch (action) {
    case 'fold': {
      player.folded     = true
      player.lastAction = 'fold'
      broadcast(state, { type: 'PLAYER_ACTION', playerId, action: 'fold' })
      state.actionQueue.shift()

      // If only one non-folded player remains, they win immediately
      const alive = state.room.players.filter((p) => !p.folded)
      if (alive.length === 1) {
        awardPotToSurvivor(state, alive[0]!.id)
        return
      }
      break
    }

    case 'check': {
      if (toCall > 0) {
        unicast(state, playerId, { type: 'ERROR', code: 'INVALID_ACTION', message: 'You must call or fold.' })
        return
      }
      player.lastAction = 'check'
      broadcast(state, { type: 'PLAYER_ACTION', playerId, action: 'check' })
      state.actionQueue.shift()
      break
    }

    case 'call': {
      const amount = Math.min(toCall, player.chips)
      player.chips      -= amount
      player.currentBet += amount
      state.room.pots[0]!.amount += amount
      if (player.chips === 0) { player.allIn = true; player.lastAction = 'all_in' }
      else player.lastAction = 'call'
      broadcast(state, { type: 'PLAYER_ACTION', playerId, action: player.lastAction, amount })
      state.actionQueue.shift()
      break
    }

    case 'raise': {
      const target = raiseAmount ?? 0
      const minTarget = Math.max(roomBet + bigBlind, state.room.minRaise)
      if (target < minTarget && target < player.chips + player.currentBet) {
        // Raise amount below minimum and player isn't going all-in — downgrade to call
        // rather than silently returning (which would leave the turn timer orphaned).
        if (player.isBot) {
          const callAmt = Math.min(toCall, player.chips)
          player.chips      -= callAmt
          player.currentBet += callAmt
          state.room.pots[0]!.amount += callAmt
          if (player.chips === 0) { player.allIn = true; player.lastAction = 'all_in' }
          else player.lastAction = 'call'
          broadcast(state, { type: 'PLAYER_ACTION', playerId, action: player.lastAction, amount: callAmt })
          state.actionQueue.shift()
          break
        }
        unicast(state, playerId, { type: 'ERROR', code: 'RAISE_TOO_SMALL', message: `Minimum raise is ${minTarget}.` })
        return
      }
      const actualTotal = Math.min(target, player.chips + player.currentBet)
      const added = actualTotal - player.currentBet
      player.chips      -= added
      player.currentBet  = actualTotal
      state.room.pots[0]!.amount += added
      state.room.minRaise = actualTotal + (actualTotal - roomBet)
      state.room.currentBet = actualTotal
      if (player.chips === 0) { player.allIn = true; player.lastAction = 'all_in' }
      else player.lastAction = 'raise'
      broadcast(state, { type: 'PLAYER_ACTION', playerId, action: player.lastAction, amount: actualTotal })
      rebuildQueueAfterRaise(state, playerId)
      break
    }

    case 'all_in': {
      const amount = player.chips
      player.chips      = 0
      player.currentBet += amount
      state.room.pots[0]!.amount += amount
      player.allIn      = true
      player.lastAction = 'all_in'
      if (player.currentBet > state.room.currentBet) {
        state.room.currentBet = player.currentBet
        state.room.minRaise   = player.currentBet + amount
        rebuildQueueAfterRaise(state, playerId)
      } else {
        state.actionQueue.shift()
      }
      broadcast(state, { type: 'PLAYER_ACTION', playerId, action: 'all_in', amount })
      break
    }
  }

  advanceAction(state)
}

function advanceAction(state: RoomState) {
  broadcastStateToAll(state)

  if (state.actionQueue.length === 0) {
    // End of this street's betting
    collectStreetBets(state)
    advanceStreet(state)
    return
  }

  state.room.activePlayerId = state.actionQueue[0]!
  broadcastStateToAll(state)
  startTurnTimer(state, state.room.activePlayerId)
  scheduleBotActionIfNeeded(state)
}

// ── Street transitions ─────────────────────────────────────────────────────────

function advanceStreet(state: RoomState) {
  clearAllTimers(state)

  switch (state.room.phase) {
    case Phase.PREFLOP:
      dealFlop(state)
      setPhase(state, Phase.FLOP)
      broadcastStateToAll(state)
      broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.FLOP })
      startBettingRound(state, 'flop')
      break
    case Phase.FLOP:
      dealTurn(state)
      setPhase(state, Phase.TURN)
      broadcastStateToAll(state)
      broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.TURN })
      startBettingRound(state, 'turn')
      break
    case Phase.TURN:
      dealRiver(state)
      setPhase(state, Phase.RIVER)
      broadcastStateToAll(state)
      broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.RIVER })
      startBettingRound(state, 'river')
      break
    case Phase.RIVER:
      handleShowdown(state)
      break
  }
}

function dealFlop(state: RoomState): void {
  state.deck.pop() // burn
  state.room.communityCards = [state.deck.pop()!, state.deck.pop()!, state.deck.pop()!]
}

function dealTurn(state: RoomState): void {
  state.deck.pop() // burn
  state.room.communityCards.push(state.deck.pop()!)
}

function dealRiver(state: RoomState): void {
  state.deck.pop() // burn
  state.room.communityCards.push(state.deck.pop()!)
}

// ── Showdown ───────────────────────────────────────────────────────────────────

function handleShowdown(state: RoomState) {
  clearAllTimers(state)
  collectStreetBets(state)
  setPhase(state, Phase.SHOWDOWN)
  state.room.activePlayerId = null

  const pots = computeShowdownPots(state)
  state.room.pots = pots

  // Evaluate hands for all non-folded players
  const community = state.room.communityCards
  const results = new Map<string, { score: number; handName: string }>()

  for (const player of state.room.players) {
    if (player.folded) continue
    const hole = state.holeCards.get(player.id)
    if (!hole || community.length < 5) continue
    const result = evaluateBestHand(hole, community)
    player.handName = result.name
    results.set(player.id, { score: result.score, handName: result.name })
  }

  // Award each pot to its best-hand player(s)
  for (const pot of pots) {
    if (pot.amount === 0) continue

    const contestants = pot.eligiblePlayerIds
      .map((id) => ({ id, score: results.get(id)?.score ?? -1 }))
      .filter((c) => c.score >= 0)

    if (contestants.length === 0) {
      // Fallback: award to any non-folded player
      const fallback = state.room.players.find((p) => !p.folded)
      if (fallback) { fallback.chips += pot.amount; fallback.isWinner = true }
      continue
    }

    const bestScore = Math.max(...contestants.map((c) => c.score))
    const winners   = contestants.filter((c) => c.score === bestScore)
    const share     = Math.floor(pot.amount / winners.length)
    let   remainder = pot.amount - share * winners.length

    for (const w of winners) {
      const player = state.room.players.find((p) => p.id === w.id)
      if (player) { player.chips += share; player.isWinner = true }
    }
    // Leftover chip(s) go to first winner
    if (remainder > 0) {
      const first = state.room.players.find((p) => p.id === winners[0]!.id)
      if (first) first.chips += remainder
    }
  }

  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.SHOWDOWN })

  setTimer(state, 'scores', () => {
    const s = getRoom(state.room.id)
    if (!s) return
    setPhase(s, Phase.SCORES)
    broadcastStateToAll(s)
    broadcast(s, { type: 'PHASE_CHANGED', phase: Phase.SCORES })

    setTimer(s, 'next-hand', () => {
      const s2 = getRoom(s.room.id)
      if (!s2) return
      advanceFromScores(s2)
    }, SCORES_PAUSE_MS)
  }, 2_000)
}

// When only one player hasn't folded mid-hand
function awardPotToSurvivor(state: RoomState, winnerId: string) {
  clearAllTimers(state)
  collectStreetBets(state)

  const winner = state.room.players.find((p) => p.id === winnerId)
  if (winner) {
    const total = state.room.pots.reduce((s, p) => s + p.amount, 0)
    winner.chips   += total
    winner.isWinner = true
    for (const pot of state.room.pots) pot.amount = 0
  }

  state.room.activePlayerId = null
  setPhase(state, Phase.SCORES)
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.SCORES })

  setTimer(state, 'next-hand', () => {
    const s = getRoom(state.room.id)
    if (!s) return
    advanceFromScores(s)
  }, SCORES_PAUSE_MS)
}

function advanceFromScores(state: RoomState) {
  // Remove bust players (0 chips)
  const bust = state.room.players.filter((p) => !p.isBot && p.chips === 0)
  for (const p of bust) {
    unicast(state, p.id, { type: 'ERROR', code: 'BUSTED', message: 'You ran out of chips.' })
  }

  const withChips = state.room.players.filter((p) => p.chips > 0)
  if (withChips.length < 2) {
    endGame(state)
  } else {
    startNewHand(state)
  }
}

function endGame(state: RoomState) {
  clearAllTimers(state)
  setPhase(state, Phase.GAME_OVER)

  const sorted = [...state.room.players].sort((a, b) => b.chips - a.chips)
  broadcastStateToAll(state)
  broadcast(state, { type: 'GAME_OVER', finalStandings: sorted })

  setTimer(state, 'cleanup', () => deleteRoom(state.room.id), 10 * 60 * 1_000)
}

// ── Player removal ─────────────────────────────────────────────────────────────

function handleKickPlayer(state: RoomState, playerId: string, targetId: string) {
  const host = state.room.players.find((p) => p.id === playerId)
  if (!host?.isHost || targetId === playerId) return
  unicast(state, targetId, { type: 'ERROR', code: 'KICKED', message: 'You have been kicked.' })
  state.peers.get(targetId)?.close()
  removePlayer(state, targetId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId: targetId })
  checkRoomEmpty(state)
}

function handleLeave(state: RoomState, playerId: string) {
  removePlayer(state, playerId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId })
  checkRoomEmpty(state)
}

function handlePlayerGone(state: RoomState, playerId: string) {
  const inBettingPhase = [Phase.PREFLOP, Phase.FLOP, Phase.TURN, Phase.RIVER].includes(state.room.phase)

  // If it was their turn, auto-fold
  if (inBettingPhase && state.room.activePlayerId === playerId) {
    handleAction(state, playerId, 'fold')
  }

  removePlayer(state, playerId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId })
  checkRoomEmpty(state)
}

function checkRoomEmpty(state: RoomState) {
  if (state.room.players.filter((p) => !p.isBot).length === 0) deleteRoom(state.room.id)
}

// ── Turn timer ─────────────────────────────────────────────────────────────────

function startTurnTimer(state: RoomState, playerId: string) {
  const secs = state.room.config.turnTimerSeconds
  if (secs <= 0) return

  let remaining = secs
  setInterval_(state, 'turnTimer', () => {
    remaining--
    broadcast(state, { type: 'TIMER_TICK', secondsLeft: remaining })
    if (remaining <= 0) {
      clearTimerByKey(state, 'turnTimer')
      clearTimerByKey(state, 'bot-action')
      const s = getRoom(state.room.id)
      if (!s) return
      const timedOutPlayer = s.room.players.find((p) => p.id === playerId)
      if (timedOutPlayer?.isBot) {
        executeBotAction(s, playerId)
      } else {
        handleAction(s, playerId, 'fold')
      }
    }
  }, 1_000)
}

// ── Bot AI ─────────────────────────────────────────────────────────────────────

function scheduleBotActionIfNeeded(state: RoomState) {
  const activeId = state.room.activePlayerId
  if (!activeId) return
  const player = state.room.players.find((p) => p.id === activeId)
  if (!player?.isBot) return

  const delay = BOT_ACTION_MIN_MS + Math.random() * BOT_ACTION_RANGE_MS
  setTimer(state, 'bot-action', () => {
    const s = getRoom(state.room.id)
    if (!s || s.room.activePlayerId !== activeId) return
    const p = s.room.players.find((pl) => pl.id === activeId)
    if (!p?.isBot) return
    executeBotAction(s, activeId)
  }, delay)
}

function executeBotAction(state: RoomState, botId: string) {
  const player = state.room.players.find((p) => p.id === botId)
  if (!player) return

  // Safety net: if anything throws (e.g. hand evaluator edge case), fall back to check/fold
  // so the turn always advances and no timeout occurs.
  try {
    _doBotAction(state, botId, player)
  } catch {
    const toCall = state.room.currentBet - player.currentBet
    handleAction(state, botId, toCall === 0 ? 'check' : 'fold')
  }
}

function _doBotAction(state: RoomState, botId: string, player: PokerPlayer) {
  const strength  = getBotHandStrength(state, botId)
  const toCall    = state.room.currentBet - player.currentBet
  const pot       = Math.max(state.room.pots.reduce((s, p) => s + p.amount, 0), state.room.config.bigBlind)
  const bigBlind  = state.room.config.bigBlind
  const minTarget = Math.max(state.room.currentBet + bigBlind, state.room.minRaise)
  const canRaise  = (player.chips + player.currentBet) >= minTarget
  const rand      = Math.random()

  function botBet(potFraction: number) {
    const raw     = Math.round(pot * potFraction / bigBlind) * bigBlind
    const target  = state.room.currentBet + Math.max(raw, bigBlind)
    const clamped = Math.max(minTarget, Math.min(target, player.chips + player.currentBet))
    handleAction(state, botId, 'raise', clamped)
  }

  // Monster (full house+) — go all-in or massive raise
  if (strength > 0.78) {
    if (!canRaise) {
      handleAction(state, botId, toCall > 0 ? 'call' : 'check')
    } else if (toCall === 0) {
      botBet(rand < 0.35 ? 0.75 : 1.25)
    } else {
      if (rand < 0.50) handleAction(state, botId, 'all_in')
      else botBet(rand < 0.5 ? 1.0 : 1.75)
    }
    return
  }

  // Strong hand (trips, straight, flush) — bet aggressively, call big
  if (strength > 0.55) {
    if (toCall === 0) {
      if (canRaise && rand < 0.88) botBet(rand < 0.5 ? 0.6 : 0.9)
      else handleAction(state, botId, 'check')
    } else if (canRaise && toCall <= pot * 0.65 && rand < 0.55) {
      botBet(0.9)
    } else if (toCall <= pot * 1.5) {
      handleAction(state, botId, 'call')
    } else {
      handleAction(state, botId, rand < 0.45 ? 'call' : 'fold')
    }
    return
  }

  // Medium hand (two pair, one pair) — moderate betting, call liberally
  if (strength > 0.36) {
    if (toCall === 0) {
      if (canRaise && rand < 0.68) botBet(rand < 0.55 ? 0.5 : 0.75)
      else handleAction(state, botId, 'check')
    } else if (toCall <= Math.max(pot * 0.55, bigBlind * 5)) {
      if (canRaise && rand < 0.28) botBet(0.65)
      else handleAction(state, botId, 'call')
    } else {
      handleAction(state, botId, rand < 0.35 ? 'call' : 'fold')
    }
    return
  }

  // Weak hand — bluff often, call small bets, rarely fold to tiny bets
  if (toCall === 0) {
    if (canRaise && rand < 0.42) botBet(rand < 0.6 ? 0.5 : 0.75)
    else handleAction(state, botId, 'check')
  } else if (toCall <= bigBlind * 4 && rand < 0.50) {
    handleAction(state, botId, 'call')
  } else if (toCall <= bigBlind * 8 && rand < 0.18) {
    handleAction(state, botId, 'call')
  } else {
    handleAction(state, botId, rand < 0.07 ? 'call' : 'fold')
  }
}

function getBotHandStrength(state: RoomState, botId: string): number {
  const hole = state.holeCards.get(botId)
  if (!hole) return 0

  const community = state.room.communityCards
  if (community.length === 0) {
    return preflopStrength(hole)
  }

  // Post-flop: evaluate hand rank (0-8) and normalize
  // rank 0=high card → 0.35, 1=pair → 0.45, 2=two-pair → 0.55, 3=trips → 0.65 …
  const result = evaluateBestHand(hole, community)
  return 0.35 + result.rank * 0.10
}
