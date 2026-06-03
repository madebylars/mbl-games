import { getPublicRooms } from '../../../games/poker/roomStore'

// GET /api/games/poker/rooms — returns all public rooms for the lobby
export default defineEventHandler(() => {
  return getPublicRooms()
})
