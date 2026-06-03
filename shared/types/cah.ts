import type { BasePlayer, BaseRoom, BaseRoomConfig, CoreServerMessage } from './core'

// ── Game phases ────────────────────────────────────────────────────────────────

export enum GamePhase {
  LOBBY     = 'LOBBY',      // waiting for players, host can start
  READING   = 'READING',    // black card revealed, brief pause before answering
  ANSWERING = 'ANSWERING',  // players submit white card(s); Card Czar waits
  JUDGING   = 'JUDGING',    // all answers revealed; Czar picks winner
  SCORES    = 'SCORES',     // round winner shown; brief pause before next round
  GAME_OVER = 'GAME_OVER',  // final winner declared
}

// ── Cards ──────────────────────────────────────────────────────────────────────

export interface BlackCard {
  id: string
  text: string      // "_" marks each blank (1–3 blanks)
  pick: 1 | 2 | 3  // how many white cards must be submitted
  pack: string
}

export interface WhiteCard {
  id: string
  text: string
  pack: string
}

// ── Players ────────────────────────────────────────────────────────────────────

export interface Player extends BasePlayer {
  score: number
  isCzar: boolean
}

// ── Round ──────────────────────────────────────────────────────────────────────

export interface Submission {
  playerId: string
  cards: string[]    // white card IDs, in play order
  revealed: boolean  // false until Czar flips during JUDGING
}

export interface Round {
  number: number
  czarId: string
  blackCard: BlackCard
  submissions: Submission[]
  winnerId: string | null
}

// ── Room ───────────────────────────────────────────────────────────────────────

export interface RoomConfig extends BaseRoomConfig {
  pointsToWin: number         // default 8 (Awesome Points)
  handSize: number            // default 10
  packs: string[]             // e.g. ["base"]
}

export interface Room extends BaseRoom<Player, RoomConfig, GamePhase> {
  currentRound: Round | null
}

// ── What the server sends each individual client ───────────────────────────────

export interface ClientGameState {
  room: Room
  myHand: string[]                   // white card IDs held by this player only
  cards: Record<string, WhiteCard>   // lookup for all cards referenced in myHand
}

// ── REST responses ─────────────────────────────────────────────────────────────

export interface CAHCreateRoomBody {
  playerName: string
  config: Partial<RoomConfig>
  bots?: number
}

// ── WebSocket messages: Client → Server ───────────────────────────────────────

export type CAHClientMessage =
  | { type: 'JOIN_ROOM';          roomId: string; playerId: string; playerName: string }
  | { type: 'START_GAME' }
  | { type: 'PLAY_CARDS';         cardIds: string[] }
  | { type: 'REVEAL_SUBMISSION';  index: number }
  | { type: 'PICK_WINNER';        index: number }
  | { type: 'NEXT_ROUND' }
  | { type: 'KICK_PLAYER';        targetId: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'PING' }

// ── WebSocket messages: Server → Client ───────────────────────────────────────

type CAHGameMessage =
  | { type: 'STATE_UPDATE';          state: ClientGameState }
  | { type: 'PHASE_CHANGED';         phase: GamePhase; round?: Round }
  | { type: 'CARDS_PLAYED';          playerId: string; count: number }
  | { type: 'SUBMISSION_REVEALED';   index: number; cards: WhiteCard[] }
  | { type: 'ROUND_WINNER';          winnerId: string; cards: WhiteCard[] }
  | { type: 'SCORES_UPDATE';         players: Player[] }
  | { type: 'GAME_OVER';             winner: Player; scores: Player[] }

export type CAHServerMessage = CoreServerMessage | CAHGameMessage
