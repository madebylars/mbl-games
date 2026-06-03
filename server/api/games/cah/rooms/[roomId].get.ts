import { createError, getRouterParam } from 'h3'
import { getRoom } from '../../../../games/cah/roomStore'

// GET /api/games/cah/rooms/:roomId — single room info (used before joining to detect full/in-progress)
export default defineEventHandler((event) => {
  const roomId = getRouterParam(event, 'roomId') ?? ''
  const state = getRoom(roomId)

  if (!state) {
    throw createError({ statusCode: 404, statusMessage: 'Room not found.' })
  }

  const { room } = state
  return {
    id: room.id,
    name: room.config.name,
    playerCount: room.players.filter((p) => !p.isBot && p.connected).length,
    maxPlayers: room.config.maxPlayers,
    phase: room.phase,
    isPublic: room.config.isPublic,
  }
})
