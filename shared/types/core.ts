// ── Shared base types for all games ───────────────────────────────────────────
//
// Every game's Player, RoomConfig, and Room extend these interfaces.
// Core server utilities (roomCore.ts) operate on these base shapes.

export type Language = 'en' | 'sv'

// ── Player ────────────────────────────────────────────────────────────────────

export interface BasePlayer {
  id: string
  name: string
  isHost: boolean
  isBot: boolean
  connected: boolean   // false during reconnect grace period
}

// ── Room config ───────────────────────────────────────────────────────────────

export interface BaseRoomConfig {
  name: string
  maxPlayers: number
  isPublic: boolean
  language: Language
  turnTimerSeconds: number   // 0 = no turn timer
  bots: number
}

// ── Room ──────────────────────────────────────────────────────────────────────

export interface BaseRoom<
  TPlayer extends BasePlayer = BasePlayer,
  TConfig extends BaseRoomConfig = BaseRoomConfig,
  TPhase extends string = string,
> {
  id: string
  config: TConfig
  phase: TPhase
  players: TPlayer[]
  createdAt: number
  lastActivityAt: number
}

// ── Win condition ─────────────────────────────────────────────────────────────

export type WinCondition =
  | { type: 'points'; target: number }    // CAH — first to N awesome points
  | { type: 'chips' }                     // Poker — last player with chips
  | { type: 'score'; target: number }     // Soccer / goal-based games
  | { type: 'rounds'; count: number }     // fixed-round games

// ── Room list ─────────────────────────────────────────────────────────────────

export interface PublicRoomSummary {
  id: string
  name: string
  playerCount: number
  maxPlayers: number
  phase: string   // string so any game's phase enum fits
}

// ── WebSocket messages shared by all games ────────────────────────────────────

export type CoreServerMessage =
  | { type: 'WELCOME';              playerId: string; roomId: string }
  | { type: 'PLAYER_JOINED';        player: BasePlayer }
  | { type: 'PLAYER_LEFT';          playerId: string }
  | { type: 'PLAYER_DISCONNECTED';  playerId: string }
  | { type: 'TIMER_TICK';           secondsLeft: number }
  | { type: 'ERROR';                code: string; message: string }
  | { type: 'PONG' }

export type CoreClientMessage =
  | { type: 'PING' }
  | { type: 'KICK_PLAYER'; targetId: string }
  | { type: 'LEAVE_ROOM' }
