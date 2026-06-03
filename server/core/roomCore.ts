/**
 * roomCore — shared game room utilities
 *
 * All games use these functions for: messaging, timer management, player
 * connection lifecycle, room TTL cleanup, and room-list generation.
 *
 * How to use from a game's roomStore:
 *   import { broadcast, setTimer, reconnectPeer, … } from '../../core/roomCore'
 *
 * Your game's RoomState must satisfy CoreRoomState structurally — meaning
 * it needs `room.players`, `room.lastActivityAt`, `peers`, and `_timers`.
 * Because TypeScript uses structural typing, any RoomState that has these
 * fields (plus game-specific extras) will be accepted without casting.
 */
import type { Peer } from 'crossws'
import { customAlphabet } from 'nanoid'
import type { BasePlayer, PublicRoomSummary } from '../../shared/types/core'

// ── ID generators ──────────────────────────────────────────────────────────────

export const genRoomId   = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6)
export const genPlayerId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 16)

// ── Structural interface for core functions ────────────────────────────────────
//
// Game RoomState types extend this implicitly via structural typing.
// Core functions only read/write the fields listed here.

export interface CoreRoomState {
  room: {
    id: string
    config: { isPublic: boolean; name: string; maxPlayers: number }
    phase: string
    players: BasePlayer[]
    lastActivityAt: number
  }
  peers: Map<string, Peer>
  _timers: Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>
}

// ── Messaging ──────────────────────────────────────────────────────────────────

export function sendPeer(peer: Peer, msg: unknown): void {
  peer.send(JSON.stringify(msg))
}

export function broadcast(state: CoreRoomState, msg: unknown, excludeId?: string): void {
  for (const [pid, peer] of state.peers) {
    if (pid !== excludeId) {
      try { peer.send(JSON.stringify(msg)) } catch { /* peer may have closed */ }
    }
  }
}

export function unicast(state: CoreRoomState, playerId: string, msg: unknown): void {
  const peer = state.peers.get(playerId)
  if (peer) {
    try { peer.send(JSON.stringify(msg)) } catch { /* ignore */ }
  }
}

// ── Timer management ───────────────────────────────────────────────────────────

export function setTimer(state: CoreRoomState, key: string, fn: () => void, delayMs: number): void {
  clearTimerByKey(state, key)
  state._timers.set(key, setTimeout(fn, delayMs))
}

export function setInterval_(state: CoreRoomState, key: string, fn: () => void, intervalMs: number): void {
  clearTimerByKey(state, key)
  state._timers.set(key, setInterval(fn, intervalMs))
}

export function clearTimerByKey(state: CoreRoomState, key: string): void {
  const t = state._timers.get(key)
  if (t !== undefined) {
    clearTimeout(t as ReturnType<typeof setTimeout>)
    clearInterval(t as ReturnType<typeof setInterval>)
    state._timers.delete(key)
  }
}

export function clearAllTimers(state: CoreRoomState): void {
  for (const [key] of state._timers) clearTimerByKey(state, key)
}

// ── Player connection lifecycle ────────────────────────────────────────────────
//
// These functions handle the peer map and BasePlayer fields (connected, isHost).
// Game stores handle creating/removing the typed player object from room.players.

export function registerPeer(state: CoreRoomState, playerId: string, peer: Peer): void {
  state.peers.set(playerId, peer)
  touch(state)
}

export function reconnectPeer(state: CoreRoomState, peer: Peer, playerId: string): boolean {
  const player = state.room.players.find((p) => p.id === playerId)
  if (!player) return false
  player.connected = true
  state.peers.set(playerId, peer)
  touch(state)
  return true
}

export function disconnectPeer(state: CoreRoomState, playerId: string): void {
  const player = state.room.players.find((p) => p.id === playerId)
  if (player) player.connected = false
  state.peers.delete(playerId)
  touch(state)
}

export function deregisterPeer(state: CoreRoomState, playerId: string): void {
  state.peers.delete(playerId)
}

// Call after removing a player from room.players to ensure a human still holds isHost.
export function reassignHost(players: BasePlayer[]): void {
  const humans = players.filter((p) => !p.isBot && p.connected)
  if (humans.length > 0 && !humans.some((p) => p.isHost)) {
    humans[0]!.isHost = true
  }
}

// ── Room TTL cleanup ───────────────────────────────────────────────────────────
//
// Call once per game during module init. Deletes idle rooms every 60 s.
// Pass the game's own rooms Map and its deleteRoom function.

export function startRoomCleaner(
  rooms: Map<string, CoreRoomState>,
  deleteFn: (id: string) => void,
  idleMs = 2 * 60 * 60 * 1000,
): void {
  if (import.meta.server) {
    setInterval(() => {
      const cutoff = Date.now() - idleMs
      for (const [id, state] of rooms) {
        if (state.peers.size === 0 && state.room.lastActivityAt < cutoff) deleteFn(id)
      }
    }, 60_000)
  }
}

// ── Public room listing ────────────────────────────────────────────────────────

export function getPublicRoomSummaries(rooms: Map<string, CoreRoomState>): PublicRoomSummary[] {
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

// ── Phase helper ───────────────────────────────────────────────────────────────

export function setPhase(state: CoreRoomState, phase: string): void {
  state.room.phase = phase
  touch(state)
}

// ── Internal ───────────────────────────────────────────────────────────────────

export function touch(state: CoreRoomState): void {
  state.room.lastActivityAt = Date.now()
}
