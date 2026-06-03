import type { BasePlayer, BaseRoom, BaseRoomConfig, CoreServerMessage } from './core'

// ── Cards ──────────────────────────────────────────────────────────────────────

export type PokerSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type PokerRank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'

export interface PokerCard {
  suit: PokerSuit
  rank: PokerRank
}

// ── Game phases ────────────────────────────────────────────────────────────────

export enum PokerPhase {
  LOBBY     = 'LOBBY',
  PREFLOP   = 'PREFLOP',
  FLOP      = 'FLOP',
  TURN      = 'TURN',
  RIVER     = 'RIVER',
  SHOWDOWN  = 'SHOWDOWN',
  SCORES    = 'SCORES',
  GAME_OVER = 'GAME_OVER',
}

// ── Players ────────────────────────────────────────────────────────────────────

export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all_in'

export interface PokerPlayer extends BasePlayer {
  chips: number
  // Per-hand state (reset at start of each hand)
  holeCards: [PokerCard, PokerCard] | null  // hidden for opponents unless showdown
  currentBet: number       // bet placed in current betting street
  totalInPot: number       // total invested this hand (for side-pot calc)
  folded: boolean
  allIn: boolean
  isDealer: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  lastAction: PlayerAction | null
  handName: string | null  // set at showdown
  isWinner: boolean
}

// ── Pot ───────────────────────────────────────────────────────────────────────

export interface Pot {
  amount: number
  eligiblePlayerIds: string[]
}

// ── Room ───────────────────────────────────────────────────────────────────────

export interface PokerRoomConfig extends BaseRoomConfig {
  startingChips: number      // default 1000
  smallBlind: number         // default 10
  bigBlind: number           // default 20
}

export interface PokerRoom extends BaseRoom<PokerPlayer, PokerRoomConfig, PokerPhase> {
  communityCards: PokerCard[]
  pots: Pot[]
  currentBet: number          // highest bet in current street
  minRaise: number            // minimum legal raise amount
  activePlayerId: string | null
  handNumber: number
}

// ── What each client receives ─────────────────────────────────────────────────

export interface PokerClientState {
  room: PokerRoom
  myHoleCards: [PokerCard, PokerCard] | null
}

// ── REST responses ─────────────────────────────────────────────────────────────

export interface PokerRoomSummary {
  id: string
  name: string
  playerCount: number
  maxPlayers: number
  phase: PokerPhase
}

export interface PokerCreateRoomBody {
  playerName: string
  config: Partial<PokerRoomConfig>
  bots?: number
}

// ── WebSocket messages: Client → Server ───────────────────────────────────────

export type PokerClientMessage =
  | { type: 'JOIN_ROOM';    roomId: string; playerId: string; playerName: string }
  | { type: 'START_GAME' }
  | { type: 'FOLD' }
  | { type: 'CHECK' }
  | { type: 'CALL' }
  | { type: 'RAISE';        amount: number }
  | { type: 'ALL_IN' }
  | { type: 'KICK_PLAYER';  targetId: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PING' }

// ── WebSocket messages: Server → Client ───────────────────────────────────────

type PokerGameMessage =
  | { type: 'STATE_UPDATE';        state: PokerClientState }
  | { type: 'PHASE_CHANGED';       phase: PokerPhase }
  | { type: 'PLAYER_ACTION';       playerId: string; action: PlayerAction; amount?: number }
  | { type: 'GAME_OVER';           finalStandings: PokerPlayer[] }

export type PokerServerMessage = CoreServerMessage | PokerGameMessage
