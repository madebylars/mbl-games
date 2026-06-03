import { getPublicRooms } from '../../../games/cah/roomStore'

// GET /api/games/cah/rooms — returns all public, joinable rooms for the lobby
export default defineEventHandler(() => {
  return getPublicRooms()
})
