import { createError, readBody } from 'h3'
import type { CAHCreateRoomBody } from '../../../../shared/types/cah'
import { createRoom, getRoomCount } from '../../../games/cah/roomStore'

const MAX_ROOMS = 200

// POST /api/games/cah/rooms — create a new room, returns { roomId }
export default defineEventHandler(async (event) => {
  if (getRoomCount() >= MAX_ROOMS) {
    throw createError({ statusCode: 503, statusMessage: 'Server is at capacity. Try again later.' })
  }

  const body = await readBody<CAHCreateRoomBody>(event)

  // Basic validation
  if (typeof body !== 'object' || body === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body.' })
  }

  const bots = Math.min(Math.max(Number(body.bots ?? 0), 0), 4)
  const state = await createRoom(body.config ?? {}, bots)

  return { roomId: state.room.id }
})
