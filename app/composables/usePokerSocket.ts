/**
 * Manages the raw WebSocket connection to the Poker server.
 * Handles connect, reconnect (up to 3 attempts), keepalive PING, and clean teardown.
 */
import type { PokerPokerClientMessage, PokerPokerServerMessage } from "../../shared/types/poker"

function genId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

export function usePokerSocket(
  roomId: Ref<string> | string,
  playerName: Ref<string> | string,
) {
  const playerId = ref('')

  onMounted(() => {
    let id = localStorage.getItem('poker-player-id')
    if (!id) { id = genId(); localStorage.setItem('poker-player-id', id) }
    playerId.value = id
  })

  const status      = ref<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')
  const lastMessage = ref<PokerServerMessage | null>(null)

  let ws:             WebSocket | null = null
  let pingTimer:      ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout>  | null = null
  let attempts = 0
  let closing  = false

  function buildUrl(): string {
    const rid  = toValue(roomId)
    const name = encodeURIComponent((toValue(playerName) || 'Player').slice(0, 32))
    const pid  = playerId.value
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/games/poker/ws?roomId=${rid}&playerId=${pid}&name=${name}`
  }

  function connect() {
    if (!import.meta.client || !playerId.value) return
    closing = false
    status.value = 'connecting'

    ws = new WebSocket(buildUrl())

    ws.onopen = () => {
      status.value = 'connected'
      attempts = 0
      pingTimer = setInterval(() => send({ type: 'PING' }), 25_000)
    }

    ws.onmessage = (ev) => {
      try { lastMessage.value = JSON.parse(ev.data as string) as PokerServerMessage }
      catch { /* ignore malformed frames */ }
    }

    ws.onclose = () => {
      status.value = 'disconnected'
      clearPing()
      if (!closing) scheduleReconnect()
    }

    ws.onerror = () => { status.value = 'error' }
  }

  function scheduleReconnect() {
    if (attempts >= 3) return
    const delay = [1_500, 3_000, 5_000][attempts] ?? 5_000
    attempts++
    reconnectTimer = setTimeout(connect, delay)
  }

  function send(msg: PokerClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function clearPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  }

  function disconnect() {
    closing = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    clearPing()
    ws?.close()
    ws = null
    status.value = 'disconnected'
  }

  watch(playerId, (id) => { if (id) connect() }, { once: true })

  onUnmounted(() => {
    send({ type: 'LEAVE_ROOM' })
    disconnect()
  })

  return { playerId, status, lastMessage, send, disconnect }
}
