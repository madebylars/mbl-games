import type { Peer } from 'crossws'
import type {
  PlayerAction,
  PokerCard,
  PokerPlayer,
  PokerRoom,
  PokerRoomConfig,
  Pot,
  PokerServerMessage,
} from '../../../shared/types/poker'
import { PokerPhase as Phase } from '../../../shared/types/poker'
import {
  broadcast,
  clearAllTimers,
  clearTimerByKey,
  deregisterPeer,
  disconnectPeer,
  genRoomId,
  genPlayerId,
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

// ── Deck helpers ───────────────────────────────────────────────────────────────

function makeDeck(): PokerCard[] {
  const suits  = ['hearts', 'diamonds', 'clubs', 'spades'] as const
  const ranks  = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const
  const deck: PokerCard[] = []
  for (const suit of suits) for (const rank of ranks) deck.push({ suit, rank })
  return deck
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i]!, a[j]!] = [a[j]!, a[i]!]
  }
  return a
}

// ── Internal room state ────────────────────────────────────────────────────────

export interface RoomState {
  room: PokerRoom
  peers: Map<string, Peer>
  deck: PokerCard[]
  holeCards: Map<string, [PokerCard, PokerCard]>
  actionQueue: string[]
  dealerPlayerId: string
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

export function createRoom(config: Partial<PokerRoomConfig>, botCount = 0): RoomState {
  const roomId = genRoomId()

  const resolved: PokerRoomConfig = {
    name:             config.name             ?? 'Poker Room',
    maxPlayers:       Math.min(config.maxPlayers ?? 8, 9),
    isPublic:         config.isPublic         ?? true,
    language:         config.language         ?? 'en',
    turnTimerSeconds: config.turnTimerSeconds ?? 30,
    bots:             Math.min(botCount, 7),
    startingChips:    config.startingChips    ?? 1000,
    smallBlind:       config.smallBlind       ?? 10,
    bigBlind:         config.bigBlind         ?? 20,
  }

  const state: RoomState = {
    room: {
      id: roomId,
      config: resolved,
      phase: Phase.LOBBY,
      players: [],
      communityCards: [],
      pots: [],
      currentBet: 0,
      minRaise: resolved.bigBlind,
      activePlayerId: null,
      handNumber: 0,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    },
    peers: new Map(),
    deck: [],
    holeCards: new Map(),
    actionQueue: [],
    dealerPlayerId: '',
    _timers: new Map(),
  }

  for (let i = 0; i < resolved.bots; i++) {
    state.room.players.push(makeEmptyPlayer(genPlayerId(), `Bot ${i + 1}`, resolved.startingChips, false, true))
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

// ── Player helpers ─────────────────────────────────────────────────────────────

function makeEmptyPlayer(
  id: string, name: string, chips: number, isHost: boolean, isBot: boolean,
): PokerPlayer {
  return {
    id, name, chips, isHost, isBot,
    connected: true,
    holeCards: null,
    currentBet: 0,
    totalInPot: 0,
    folded: false,
    allIn: false,
    isDealer: false,
    isSmallBlind: false,
    isBigBlind: false,
    lastAction: null,
    handName: null,
    isWinner: false,
  }
}

export function addPlayer(state: RoomState, peer: Peer, playerId: string, name: string): PokerPlayer {
  const isFirstHuman = state.room.players.every((p) => p.isBot)
  const player = makeEmptyPlayer(playerId, name, state.room.config.startingChips, isFirstHuman, false)
  state.room.players.push(player)
  registerPeer(state, playerId, peer)
  return player
}

export function reconnectPlayer(state: RoomState, peer: Peer, playerId: string): PokerPlayer | null {
  if (!reconnectPeer(state, peer, playerId)) return null
  return state.room.players.find((p) => p.id === playerId) ?? null
}

export function disconnectPlayer(state: RoomState, playerId: string): void {
  disconnectPeer(state, playerId)
}

export function removePlayer(state: RoomState, playerId: string): void {
  const idx = state.room.players.findIndex((p) => p.id === playerId)
  if (idx !== -1) state.room.players.splice(idx, 1)
  state.holeCards.delete(playerId)
  state.actionQueue = state.actionQueue.filter((id) => id !== playerId)
  deregisterPeer(state, playerId)
  reassignHost(state.room.players)
  if (state.dealerPlayerId === playerId) {
    const active = getActivePlayers(state)
    state.dealerPlayerId = active[0]?.id ?? ''
  }
  touch(state)
}

// ── Messaging helpers with typed ServerMessage ─────────────────────────────────

export function broadcastMsg(state: RoomState, msg: PokerServerMessage, excludeId?: string): void {
  broadcast(state, msg, excludeId)
}

export function unicastMsg(state: RoomState, playerId: string, msg: PokerServerMessage): void {
  unicast(state, playerId, msg)
}

export function sendMsg(peer: Peer, msg: PokerServerMessage): void {
  sendPeer(peer, msg)
}

// ── Client state ───────────────────────────────────────────────────────────────

export function buildClientState(state: RoomState, playerId: string) {
  const room: PokerRoom = JSON.parse(JSON.stringify(state.room)) as PokerRoom
  const isShowdown = [Phase.SHOWDOWN, Phase.SCORES].includes(state.room.phase)

  for (const player of room.players) {
    if (player.id === playerId) {
      player.holeCards = state.holeCards.get(player.id) ?? null
    } else if (isShowdown && !player.folded) {
      player.holeCards = state.holeCards.get(player.id) ?? null
    } else {
      player.holeCards = null
    }
  }

  return { room, myHoleCards: state.holeCards.get(playerId) ?? null }
}

export function broadcastStateToAll(state: RoomState): void {
  for (const [playerId] of state.peers) {
    unicast(state, playerId, { type: 'STATE_UPDATE', state: buildClientState(state, playerId) })
  }
}

// ── Hand management ────────────────────────────────────────────────────────────

export function getActivePlayers(state: RoomState): PokerPlayer[] {
  return state.room.players.filter((p) => p.chips > 0 || p.totalInPot > 0)
}

export function dealNewHand(state: RoomState): void {
  clearAllTimers(state)

  const eligible = state.room.players.filter((p) => p.chips > 0)
  if (eligible.length < 2) return

  for (const player of state.room.players) {
    player.holeCards    = null
    player.currentBet   = 0
    player.totalInPot   = 0
    player.folded       = player.chips === 0
    player.allIn        = false
    player.isDealer     = false
    player.isSmallBlind = false
    player.isBigBlind   = false
    player.lastAction   = null
    player.handName     = null
    player.isWinner     = false
  }

  state.room.communityCards = []
  state.room.pots           = [{ amount: 0, eligiblePlayerIds: eligible.map((p) => p.id) }]
  state.room.currentBet     = 0
  state.room.minRaise       = state.room.config.bigBlind
  state.room.activePlayerId = null
  state.holeCards           = new Map()
  state.actionQueue         = []
  state.room.handNumber++

  const prevDealerIdx = eligible.findIndex((p) => p.id === state.dealerPlayerId)
  const newDealerIdx  = (prevDealerIdx + 1) % eligible.length
  state.dealerPlayerId = eligible[newDealerIdx]!.id

  const n    = eligible.length
  const dIdx = newDealerIdx
  const sbIdx = n === 2 ? dIdx : (dIdx + 1) % n
  const bbIdx = n === 2 ? (dIdx + 1) % n : (dIdx + 2) % n

  eligible[dIdx]!.isDealer     = true
  eligible[sbIdx]!.isSmallBlind = true
  eligible[bbIdx]!.isBigBlind   = true

  state.deck = shuffled(makeDeck())
  for (const p of eligible) {
    state.holeCards.set(p.id, [state.deck.pop()!, state.deck.pop()!])
  }

  const { smallBlind, bigBlind } = state.room.config
  postBlind(state, eligible[sbIdx]!, smallBlind)
  postBlind(state, eligible[bbIdx]!, bigBlind)
  state.room.currentBet = bigBlind
  state.room.minRaise   = bigBlind * 2

  touch(state)
}

function postBlind(state: RoomState, player: PokerPlayer, amount: number): void {
  const actual = Math.min(amount, player.chips)
  player.chips     -= actual
  player.currentBet = actual
  player.totalInPot = actual
  state.room.pots[0]!.amount += actual
  if (player.chips === 0) player.allIn = true
}

// ── Betting round helpers ──────────────────────────────────────────────────────

export function buildActionQueue(state: RoomState, afterPlayerId: string): string[] {
  const allIds   = state.room.players.map((p) => p.id)
  const startIdx = allIds.indexOf(afterPlayerId)
  const n        = allIds.length
  const queue: string[] = []
  for (let offset = 1; offset <= n; offset++) {
    const pid = allIds[(startIdx + offset) % n]!
    const p   = state.room.players.find((pl) => pl.id === pid)
    if (p && !p.folded && !p.allIn) queue.push(pid)
  }
  return queue
}

export function rebuildQueueAfterRaise(state: RoomState, raiserId: string): void {
  const allIds    = state.room.players.map((p) => p.id)
  const raiserIdx = allIds.indexOf(raiserId)
  const n         = allIds.length
  const queue: string[] = []
  for (let offset = 1; offset <= n; offset++) {
    const pid = allIds[(raiserIdx + offset) % n]!
    const p   = state.room.players.find((pl) => pl.id === pid)
    if (p && !p.folded && !p.allIn && p.currentBet < state.room.currentBet) queue.push(pid)
  }
  state.actionQueue = queue
}

export function collectStreetBets(state: RoomState): void {
  for (const p of state.room.players) {
    if (p.currentBet > 0) {
      p.totalInPot += p.currentBet
      p.currentBet  = 0
    }
  }
  state.room.currentBet = 0
  state.room.minRaise   = state.room.config.bigBlind
  if (state.room.pots[0]) {
    state.room.pots[0].eligiblePlayerIds =
      state.room.players.filter((p) => !p.folded && p.totalInPot > 0).map((p) => p.id)
  }
}

export function computeShowdownPots(state: RoomState): Pot[] {
  const all = state.room.players.filter((p) => p.totalInPot > 0)
  if (all.length === 0) return state.room.pots

  const sorted = [...all].sort((a, b) => a.totalInPot - b.totalInPot)
  const pots: Pot[] = []
  let prev = 0

  for (let i = 0; i < sorted.length; i++) {
    const cap          = sorted[i]!.totalInPot
    if (cap === prev) continue
    const contributors = all.filter((p) => p.totalInPot >= cap).length
    const amount       = (cap - prev) * contributors
    const eligible     = all.filter((p) => p.totalInPot >= cap && !p.folded).map((p) => p.id)
    if (amount > 0) {
      pots.push({ amount, eligiblePlayerIds: eligible.length > 0 ? eligible : pots[0]?.eligiblePlayerIds ?? [] })
    }
    prev = cap
  }
  return pots
}

export function setPhase(state: RoomState, phase: string): void {
  coreSetPhase(state, phase)
}
