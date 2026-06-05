import type { Peer } from 'crossws'
import { customAlphabet } from 'nanoid'
import type {
  BlackCard,
  ClientGameState,
  GamePhase,
  Player,
  Room,
  RoomConfig,
  Round,
  CAHServerMessage,
  Submission,
  WhiteCard,
} from '../../../shared/types/cah'
import { GamePhase as Phase } from '../../../shared/types/cah'
import { getCardsByPacks, shuffled } from '../../utils/cahCards'
import {
  broadcast,
  clearAllTimers,
  clearTimerByKey,
  deregisterPeer,
  disconnectPeer,
  genRoomId,
  reassignHost,
  reconnectPeer,
  registerPeer,
  sendPeer,
  setInterval_,
  setPhase as coreSetPhase,
  setTimer,
  startRoomCleaner,
  touch,
  unicast,
} from '../../core/roomCore'

// re-export for ws.ts convenience
export { broadcast, unicast, sendPeer, setTimer, setInterval_, clearTimerByKey, clearAllTimers }

const genBotId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

// ── Internal room state ────────────────────────────────────────────────────────

export interface RoomState {
  room: Room
  peers: Map<string, Peer>
  deck: { black: BlackCard[]; white: WhiteCard[] }
  hands: Map<string, string[]>
  whiteCardIndex: Record<string, WhiteCard>
  _timers: Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>
}

// ── The store ──────────────────────────────────────────────────────────────────

const rooms = new Map<string, RoomState>()

startRoomCleaner(rooms as any, deleteRoom)

export function getRoom(roomId: string): RoomState | undefined { return rooms.get(roomId) }
export function getRoomCount(): number { return rooms.size }

export function getPublicRooms() {
  return [...rooms.values()]
    .filter((s) => s.room.config.isPublic)
    .map((s) => ({
      id:          s.room.id,
      name:        s.room.config.name,
      playerCount: s.room.players.filter((p) => !p.isBot && p.connected).length,
      maxPlayers:  s.room.config.maxPlayers,
      phase:       s.room.phase,
    }))
}

// ── Room lifecycle ─────────────────────────────────────────────────────────────

export async function createRoom(config: Partial<RoomConfig>, botCount = 0): Promise<RoomState> {
  const roomId = genRoomId()

  const resolved: RoomConfig = {
    name:               config.name               ?? 'Game Room',
    maxPlayers:         config.maxPlayers         ?? 10,
    isPublic:           config.isPublic           ?? true,
    language:           config.language           ?? 'en',
    turnTimerSeconds:   config.turnTimerSeconds   ?? 0,
    bots:               Math.min(botCount, 4),
    pointsToWin:        config.pointsToWin        ?? 8,
    handSize:           config.handSize           ?? 10,
    packs:              config.packs              ?? ['base'],
  }

  const cards = await getCardsByPacks(resolved.packs)

  const state: RoomState = {
    room: {
      id: roomId,
      config: resolved,
      phase: Phase.LOBBY,
      players: [],
      currentRound: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    },
    peers: new Map(),
    deck: {
      black: shuffled(cards.black),
      white: shuffled(cards.white),
    },
    hands: new Map(),
    whiteCardIndex: Object.fromEntries(cards.white.map((c) => [c.id, c])),
    _timers: new Map(),
  }

  for (let i = 0; i < resolved.bots; i++) {
    const bot: Player = {
      id: genBotId(),
      name: `Bot ${i + 1}`,
      score: 0,
      isHost: false,
      isCzar: false,
      isBot: true,
      connected: true,
    }
    state.room.players.push(bot)
    state.hands.set(bot.id, [])
  }

  rooms.set(roomId, state)
  return state
}

export function deleteRoom(roomId: string): void {
  const state = rooms.get(roomId)
  if (!state) return
  for (const t of state._timers.values()) clearTimeout(t as ReturnType<typeof setTimeout>)
  for (const peer of state.peers.values()) { try { peer.close() } catch { /* ignore */ } }
  rooms.delete(roomId)
}

// ── Player management ──────────────────────────────────────────────────────────

export function addPlayer(state: RoomState, peer: Peer, playerId: string, name: string): Player {
  const isFirstHuman = state.room.players.every((p) => p.isBot)
  const player: Player = {
    id: playerId, name, score: 0,
    isHost: isFirstHuman, isCzar: false, isBot: false, connected: true,
  }
  state.room.players.push(player)
  state.hands.set(playerId, [])
  registerPeer(state, playerId, peer)
  return player
}

export function reconnectPlayer(state: RoomState, peer: Peer, playerId: string): Player | null {
  if (!reconnectPeer(state, peer, playerId)) return null
  return state.room.players.find((p) => p.id === playerId) ?? null
}

export function disconnectPlayer(state: RoomState, playerId: string): void {
  disconnectPeer(state, playerId)
}

export function removePlayer(state: RoomState, playerId: string): void {
  state.room.players = state.room.players.filter((p) => p.id !== playerId)
  state.hands.delete(playerId)
  deregisterPeer(state, playerId)
  reassignHost(state.room.players)
  touch(state)
}

// ── Messaging helpers with typed ServerMessage ─────────────────────────────────

export function broadcastMsg(state: RoomState, msg: CAHServerMessage, excludeId?: string): void {
  broadcast(state, msg, excludeId)
}

export function unicastMsg(state: RoomState, playerId: string, msg: CAHServerMessage): void {
  unicast(state, playerId, msg)
}

export function sendMsg(peer: Peer, msg: CAHServerMessage): void {
  sendPeer(peer, msg)
}

// ── Card dealing ───────────────────────────────────────────────────────────────

export function dealCards(state: RoomState, playerId: string, count: number): void {
  const hand   = state.hands.get(playerId) ?? []
  const needed = Math.min(count, state.deck.white.length)
  const cards  = state.deck.white.splice(0, needed)
  hand.push(...cards.map((c) => c.id))
  state.hands.set(playerId, hand)
}

export function dealUpToHandSize(state: RoomState): void {
  const { handSize } = state.room.config
  for (const player of state.room.players) {
    const hand   = state.hands.get(player.id) ?? []
    const needed = handSize - hand.length
    if (needed > 0) dealCards(state, player.id, needed)
  }
}

// ── Client state ───────────────────────────────────────────────────────────────

export function buildClientState(state: RoomState, playerId: string): ClientGameState {
  const hand  = state.hands.get(playerId) ?? []
  const cards: Record<string, WhiteCard> = {}
  for (const id of hand) {
    const card = state.whiteCardIndex[id]
    if (card) cards[id] = card
  }

  let room = state.room
  if (state.room.currentRound) {
    const maskedSubmissions = state.room.currentRound.submissions.map((sub) => {
      if (sub.revealed || sub.playerId === playerId) {
        for (const id of sub.cards) {
          const card = state.whiteCardIndex[id]
          if (card) cards[id] = card
        }
      }
      if (!sub.revealed && sub.playerId !== playerId) return { ...sub, playerId: '' }
      return sub
    })
    room = { ...state.room, currentRound: { ...state.room.currentRound, submissions: maskedSubmissions } }
  }

  return { room, myHand: hand, cards }
}

export function broadcastStateToAll(state: RoomState): void {
  for (const [playerId] of state.peers) {
    unicast(state, playerId, { type: 'STATE_UPDATE', state: buildClientState(state, playerId) })
  }
}

// ── Round management ───────────────────────────────────────────────────────────

export function nextCzarId(state: RoomState): string {
  const players = state.room.players.filter((p) => p.connected || p.isBot)
  if (players.length === 0) return state.room.players[0]?.id ?? ''

  const currentIdx = players.findIndex((p) => p.isCzar)
  const nextIdx    = (currentIdx + 1) % players.length

  for (const p of state.room.players) p.isCzar = false
  players[nextIdx]!.isCzar = true
  return players[nextIdx]!.id
}

export function startNewRound(state: RoomState): Round | null {
  const blackCard = state.deck.black.pop()
  if (!blackCard) return null

  const czarId = nextCzarId(state)
  dealUpToHandSize(state)

  const round: Round = {
    number: (state.room.currentRound?.number ?? 0) + 1,
    czarId,
    blackCard,
    submissions: [],
    winnerId: null,
  }
  state.room.currentRound = round
  return round
}

export function setPhase(state: RoomState, phase: GamePhase): void {
  coreSetPhase(state, phase)
}

export function getSubmission(state: RoomState, playerId: string): Submission | undefined {
  return state.room.currentRound?.submissions.find((s) => s.playerId === playerId)
}

export function allNonCzarSubmitted(state: RoomState): boolean {
  if (!state.room.currentRound) return false
  const { czarId } = state.room.currentRound
  const eligible   = state.room.players.filter((p) => p.id !== czarId && (p.connected || p.isBot))
  return eligible.every((p) => state.room.currentRound!.submissions.some((s) => s.playerId === p.id))
}
