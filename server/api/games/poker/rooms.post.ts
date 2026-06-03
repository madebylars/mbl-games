import { createError, readBody } from 'h3'
import type { PokerCreateRoomBody } from '../../../../shared/types/poker'
import { createRoom, getRoomCount } from '../../../games/poker/roomStore'

const MAX_ROOMS = 200

// POST /api/games/poker/rooms — create a new room, returns { roomId }
export default defineEventHandler(async (event) => {
  if (getRoomCount() >= MAX_ROOMS) {
    throw createError({ statusCode: 503, statusMessage: 'Server is at capacity. Try again later.' })
  }

  const body = await readBody<PokerCreateRoomBody>(event)
  if (typeof body !== 'object' || body === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const bots  = Math.min(Math.max(Number(body.bots ?? 0), 0), 7)
  const state = createRoom(body.config ?? {}, bots)

  return { roomId: state.room.id }
})
