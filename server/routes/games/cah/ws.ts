/**
 * Cards Against Humanity — WebSocket handler & game state machine
 *
 * Endpoint: ws(s)://host/games/cah/ws?roomId=XXXXXX&playerId=...&name=...
 */
import { customAlphabet } from 'nanoid'
import type { CAHClientMessage, WhiteCard } from '../../../../shared/types/cah'
import { GamePhase as Phase } from '../../../../shared/types/cah'
import type { RoomState } from '../../../games/cah/roomStore'
import {
  addPlayer,
  allNonCzarSubmitted,
  broadcast,
  broadcastStateToAll,
  buildClientState,
  clearAllTimers,
  clearTimerByKey,
  deleteRoom,
  disconnectPlayer,
  getRoom,
  reconnectPlayer,
  removePlayer,
  sendPeer,
  setInterval_,
  setPhase,
  setTimer,
  startNewRound,
  unicast,
} from '../../../games/cah/roomStore'

const genPlayerId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

// Phase timing constants
const READING_PAUSE_MS = 4_000   // how long to show the black card before answering starts
const SCORES_PAUSE_MS  = 5_000   // how long scores screen stays before next round auto-starts
const RECONNECT_GRACE_MS = 30_000 // how long to wait for a disconnected player to return

// Maps peer.id → {roomId, playerId} — populated in open(), used in message() and close()
const peerMeta = new Map<string, { roomId: string; playerId: string }>()

// ── URL parsing ────────────────────────────────────────────────────────────────

function parseParams(peer: { request?: { url?: string } | null }) {
  const raw = peer.request?.url ?? '/'
  let url: URL
  try {
    url = raw.startsWith('http') ? new URL(raw) : new URL(`http://x${raw}`)
  } catch {
    url = new URL('http://x/')
  }
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

    // Track peer for use in message/close handlers
    peerMeta.set(peer.id, { roomId, playerId })

    // ── Reconnecting player ──────────────────────────────────────────────────
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

    // ── New player joining ───────────────────────────────────────────────────
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

    let parsed: CAHClientMessage
    try {
      parsed = JSON.parse(msg.text()) as CAHClientMessage
    } catch {
      return
    }

    switch (parsed.type) {
      case 'PING':
        unicast(state, playerId, { type: 'PONG' })
        break
      case 'START_GAME':
        handleStartGame(state, playerId)
        break
      case 'PLAY_CARDS':
        handlePlayCards(state, playerId, parsed.cardIds)
        break
      case 'REVEAL_SUBMISSION':
        handleRevealSubmission(state, playerId, parsed.index)
        break
      case 'PICK_WINNER':
        handlePickWinner(state, playerId, parsed.index)
        break
      case 'NEXT_ROUND':
        handleNextRound(state, playerId)
        break
      case 'KICK_PLAYER':
        handleKickPlayer(state, playerId, parsed.targetId)
        break
      case 'LEAVE_ROOM':
        handleLeave(state, playerId)
        break
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

    // Give the player 30s to reconnect before removing them from the room
    setTimer(state, `remove-${playerId}`, () => {
      const s = getRoom(roomId)
      if (!s) return
      const p = s.room.players.find((pl) => pl.id === playerId)
      if (p && !p.connected) handlePlayerGone(s, playerId)
    }, RECONNECT_GRACE_MS)
  },

  async error(peer, error) {
    console.error('[CAH WS]', peer.id, error)
  },
})

// ── Game state machine ─────────────────────────────────────────────────────────

function handleStartGame(state: RoomState, playerId: string) {
  const player = state.room.players.find((p) => p.id === playerId)
  if (!player?.isHost) return
  if (state.room.phase !== Phase.LOBBY) return

  if (state.room.players.length < 3) {
    unicast(state, playerId, {
      type: 'ERROR',
      code: 'NOT_ENOUGH_PLAYERS',
      message: 'Need at least 3 players (or bots) to start.',
    })
    return
  }

  startReading(state)
}

function startReading(state: RoomState) {
  clearAllTimers(state)

  const round = startNewRound(state)
  if (!round) {
    // Ran out of black cards — end the game
    endGame(state)
    return
  }

  setPhase(state, Phase.READING)
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.READING, round })

  // Auto-advance to ANSWERING after a brief reading pause
  setTimer(state, 'phase', () => startAnswering(state), READING_PAUSE_MS)
}

function startAnswering(state: RoomState) {
  clearTimerByKey(state, 'phase')
  setPhase(state, Phase.ANSWERING)
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.ANSWERING })

  // Optional countdown timer
  const { turnTimerSeconds } = state.room.config
  if (turnTimerSeconds > 0) {
    let secondsLeft = turnTimerSeconds
    setInterval_(state, 'answerTimer', () => {
      secondsLeft--
      broadcast(state, { type: 'TIMER_TICK', secondsLeft })
      if (secondsLeft <= 0) {
        clearTimerByKey(state, 'answerTimer')
        forceSubmitRemaining(state)
        startJudging(state)
      }
    }, 1_000)
  }

  scheduleBotAnswers(state)
}

function forceSubmitRemaining(state: RoomState) {
  const { currentRound } = state.room
  if (!currentRound) return
  const { pick } = currentRound.blackCard

  for (const player of state.room.players) {
    if (player.id === currentRound.czarId) continue
    if (!player.connected && !player.isBot) continue
    if (currentRound.submissions.some((s) => s.playerId === player.id)) continue

    const hand = [...(state.hands.get(player.id) ?? [])]
    const chosen = hand.slice(0, pick)
    if (chosen.length === 0) continue

    state.hands.set(player.id, hand.filter((id) => !chosen.includes(id)))
    currentRound.submissions.push({ playerId: player.id, cards: chosen, revealed: false })
  }
}

function startJudging(state: RoomState) {
  clearTimerByKey(state, 'answerTimer')
  clearTimerByKey(state, 'phase')

  // Shuffle submissions so position doesn't reveal who played what
  const subs = state.room.currentRound?.submissions
  if (subs) {
    for (let i = subs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = subs[i]!; subs[i] = subs[j]!; subs[j] = tmp
    }
  }

  setPhase(state, Phase.JUDGING)
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.JUDGING })

  // If the Czar is a bot, schedule automated reveal + pick
  const czar = state.room.players.find((p) => p.isCzar)
  if (czar?.isBot) scheduleBotJudge(state)
}

function handlePlayCards(state: RoomState, playerId: string, cardIds: string[]) {
  if (state.room.phase !== Phase.ANSWERING) return
  const { currentRound } = state.room
  if (!currentRound) return
  if (playerId === currentRound.czarId) return
  if (currentRound.submissions.some((s) => s.playerId === playerId)) return

  const { pick } = currentRound.blackCard
  if (cardIds.length !== pick) {
    unicast(state, playerId, {
      type: 'ERROR',
      code: 'WRONG_CARD_COUNT',
      message: `You must play exactly ${pick} card${pick === 1 ? '' : 's'}.`,
    })
    return
  }

  const hand = state.hands.get(playerId) ?? []
  if (!cardIds.every((id) => hand.includes(id))) {
    unicast(state, playerId, {
      type: 'ERROR',
      code: 'INVALID_CARDS',
      message: "You don't have those cards.",
    })
    return
  }

  state.hands.set(playerId, hand.filter((id) => !cardIds.includes(id)))
  currentRound.submissions.push({ playerId, cards: cardIds, revealed: false })
  broadcast(state, { type: 'CARDS_PLAYED', playerId, count: cardIds.length })

  if (allNonCzarSubmitted(state)) {
    clearTimerByKey(state, 'answerTimer')
    startJudging(state)
  }
}

function handleRevealSubmission(state: RoomState, playerId: string, index: number) {
  if (state.room.phase !== Phase.JUDGING) return
  const { currentRound } = state.room
  if (!currentRound) return
  if (currentRound.czarId !== playerId) return

  const submission = currentRound.submissions[index]
  if (!submission || submission.revealed) return

  submission.revealed = true

  const cards = submission.cards
    .map((id) => state.whiteCardIndex[id])
    .filter((c): c is WhiteCard => c !== undefined)

  broadcast(state, { type: 'SUBMISSION_REVEALED', index, cards })
}

function handlePickWinner(state: RoomState, playerId: string, index: number) {
  if (state.room.phase !== Phase.JUDGING) return
  const { currentRound } = state.room
  if (!currentRound) return
  if (currentRound.czarId !== playerId) return

  const winningSubmission = currentRound.submissions[index]
  if (!winningSubmission) return
  const winnerId = winningSubmission.playerId

  clearAllTimers(state)

  currentRound.winnerId = winnerId
  const winner = state.room.players.find((p) => p.id === winnerId)
  if (winner) winner.score += 1

  const winningCards = winningSubmission.cards
    .map((id) => state.whiteCardIndex[id])
    .filter((c): c is WhiteCard => c !== undefined)

  broadcast(state, { type: 'ROUND_WINNER', winnerId, cards: winningCards })
  broadcast(state, { type: 'SCORES_UPDATE', players: state.room.players })

  setPhase(state, Phase.SCORES)
  broadcastStateToAll(state)
  broadcast(state, { type: 'PHASE_CHANGED', phase: Phase.SCORES })

  // Auto-advance to next round after a brief pause
  setTimer(state, 'phase', () => advanceFromScores(state), SCORES_PAUSE_MS)
}

function handleNextRound(state: RoomState, playerId: string) {
  if (state.room.phase !== Phase.SCORES) return
  const player = state.room.players.find((p) => p.id === playerId)
  if (!player?.isHost) return

  // Host can skip the auto-advance timer
  clearTimerByKey(state, 'phase')
  advanceFromScores(state)
}

function advanceFromScores(state: RoomState) {
  const { pointsToWin } = state.room.config
  const hasWinner = state.room.players.some((p) => p.score >= pointsToWin)
  if (hasWinner) {
    endGame(state)
  } else {
    startReading(state)
  }
}

function endGame(state: RoomState) {
  clearAllTimers(state)
  setPhase(state, Phase.GAME_OVER)

  const sorted = [...state.room.players].sort((a, b) => b.score - a.score)
  const winner = sorted[0] ?? state.room.players[0]!

  broadcastStateToAll(state)
  broadcast(state, { type: 'GAME_OVER', winner, scores: sorted })

  // Auto-delete the room after 10 minutes
  setTimer(state, 'cleanup', () => deleteRoom(state.room.id), 10 * 60 * 1_000)
}

// ── Player removal helpers ─────────────────────────────────────────────────────

function handleKickPlayer(state: RoomState, playerId: string, targetId: string) {
  const host = state.room.players.find((p) => p.id === playerId)
  if (!host?.isHost) return
  if (targetId === playerId) return

  unicast(state, targetId, { type: 'ERROR', code: 'KICKED', message: 'You have been kicked from the room.' })
  state.peers.get(targetId)?.close()

  removePlayer(state, targetId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId: targetId })
}

function handleLeave(state: RoomState, playerId: string) {
  removePlayer(state, playerId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId })

  if (state.room.players.filter((p) => !p.isBot).length === 0) {
    deleteRoom(state.room.id)
  }
}

function handlePlayerGone(state: RoomState, playerId: string) {
  const { phase, currentRound } = state.room
  const isCzar = currentRound?.czarId === playerId

  // If the Czar disappears mid-round, restart the round with a new Czar
  if (isCzar && (phase === Phase.READING || phase === Phase.ANSWERING || phase === Phase.JUDGING)) {
    removePlayer(state, playerId)
    broadcast(state, { type: 'PLAYER_LEFT', playerId })
    handleCzarLeft(state)
    return
  }

  // If a non-Czar player disappears during ANSWERING and everyone else has submitted, advance
  if (phase === Phase.ANSWERING) {
    removePlayer(state, playerId)
    broadcast(state, { type: 'PLAYER_LEFT', playerId })
    if (allNonCzarSubmitted(state)) startJudging(state)
    return
  }

  removePlayer(state, playerId)
  broadcast(state, { type: 'PLAYER_LEFT', playerId })

  if (state.room.players.filter((p) => !p.isBot).length === 0) {
    deleteRoom(state.room.id)
  }
}

function handleCzarLeft(state: RoomState) {
  const active = state.room.players.filter((p) => p.connected || p.isBot)
  if (active.length < 2) {
    endGame(state)
    return
  }

  // Refund submitted cards back to players' hands
  if (state.room.currentRound) {
    for (const sub of state.room.currentRound.submissions) {
      const hand = state.hands.get(sub.playerId) ?? []
      hand.push(...sub.cards)
      state.hands.set(sub.playerId, hand)
    }
    state.room.currentRound.submissions = []
  }

  startReading(state)
}

// ── Bot AI ─────────────────────────────────────────────────────────────────────

function scheduleBotAnswers(state: RoomState) {
  const { currentRound } = state.room
  if (!currentRound) return

  for (const player of state.room.players) {
    if (!player.isBot || player.id === currentRound.czarId) continue

    // Bots answer after a random 3–8 second think-time
    const delay = 3_000 + Math.random() * 5_000
    setTimer(state, `bot-answer-${player.id}`, () => {
      const s = getRoom(state.room.id)
      if (!s || s.room.phase !== Phase.ANSWERING) return
      const cards = pickBotCards(s, player.id)
      if (cards.length > 0) handlePlayCards(s, player.id, cards)
    }, delay)
  }
}

function pickBotCards(state: RoomState, botId: string): string[] {
  const { currentRound } = state.room
  if (!currentRound) return []
  const { pick } = currentRound.blackCard
  const hand = [...(state.hands.get(botId) ?? [])]
  // Shuffle hand and take first `pick` cards
  for (let i = hand.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = hand[i]!; hand[i] = hand[j]!; hand[j] = tmp
  }
  return hand.slice(0, pick)
}

function scheduleBotJudge(state: RoomState) {
  const { currentRound } = state.room
  if (!currentRound) return

  // Reveal each submission with 1.5s spacing, then pick a winner 2s after the last reveal
  let delay = 1_500
  const count = currentRound.submissions.length

  for (let i = 0; i < count; i++) {
    const idx = i
    setTimer(state, `bot-reveal-${idx}`, () => {
      const s = getRoom(state.room.id)
      if (!s || s.room.phase !== Phase.JUDGING) return
      const czar = s.room.players.find((p) => p.isCzar)
      if (czar) handleRevealSubmission(s, czar.id, idx)
    }, delay)
    delay += 1_500
  }

  setTimer(state, 'bot-pick', () => {
    const s = getRoom(state.room.id)
    if (!s || s.room.phase !== Phase.JUDGING) return
    const czar = s.room.players.find((p) => p.isCzar)
    const round = s.room.currentRound
    if (!czar || !round || round.submissions.length === 0) return
    const winnerIndex = Math.floor(Math.random() * round.submissions.length)
    handlePickWinner(s, czar.id, winnerIndex)
  }, delay + 2_000)
}
