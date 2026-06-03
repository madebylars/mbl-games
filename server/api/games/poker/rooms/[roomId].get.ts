import { createError, getRouterParam } from 'h3'
import { PokerPhase } from '../../../../../shared/types/poker'
import { getRoom } from '../../../../games/poker/roomStore'

// GET /api/games/poker/rooms/:roomId — returns basic room info for join validation
export default defineEventHandler((event) => {
  const roomId = getRouterParam(event, 'roomId') ?? ''
  const state  = getRoom(roomId)

  if (!state) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found.' })
  }

  const humanCount = state.room.players.filter((p) => !p.isBot).length
  const isFull     = humanCount >= state.room.config.maxPlayers
  const inProgress = state.room.phase !== PokerPhase.LOBBY

  return {
    id:          state.room.id,
    name:        state.room.config.name,
    playerCount: humanCount,
    maxPlayers:  state.room.config.maxPlayers,
    phase:       state.room.phase,
    isFull,
    inProgress,
  }
})
