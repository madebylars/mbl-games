# MBL Games — Made by Lars

A collection of browser games built with Nuxt 4 and Vue 3. No external game libraries — every game runs on canvas or Vue reactivity, with procedurally generated sound effects and MIDI-style background music via the Web Audio API.

## Games

| Game | Type | Description |
|------|------|-------------|
| 🃏 **Cards Against Humanity** | Multiplayer | Party game for horrible people — fill in the blanks, the most wrong answer wins. Public & private rooms, shareable links, solo demo with bots |
| ♠️ **Poker** | Multiplayer | Texas Hold'em — bet, raise, bluff, go all-in. Public & private rooms, bot opponents |
| ⚽ **Soccer** | Multiplayer | Kick-off and score goals. Three game modes |
| 🐍 **Snake** | Canvas | Classic snake — eat food, grow longer, don't hit yourself |
| 🃏 **Memory** | DOM | Flip cards and match all pairs in as few moves as possible |
| 🧠 **Quiz** | DOM | 140 questions across 7 categories, 10 per round |
| 🔢 **2048** | DOM | Slide and merge tiles to reach 2048 |
| 👾 **Space Invaders** | Canvas | Shoot down waves of descending aliens |
| 🚗 **Rally-X** | Canvas | Drive a maze, collect flags, use smoke to shake off enemy cars |
| 🏃 **Platformer** | Canvas | Side-scrolling — jump between platforms, stomp enemies, collect coins |
| 🚀 **Scramble** | Canvas | Side-scrolling shooter — fly through enemy terrain, bomb fuel depots to keep going, reach the base |
| 🔢 **Animal Count** | DOM | Count animals and tap the right number (great for small children) |
| 🔤 **Spell the Animal** | DOM | Tap letters in order to spell the animal's name |
| 👾 **Galaxian** | Canvas | Fixed shooter — dive-bombing alien formations, survive as long as you can |
| ⛏️ **Dig Dug** | Canvas | Dig tunnels, inflate enemies to pop them, drop boulders to crush them |

## Audio

All audio is generated at runtime — no audio files or external assets.

- **Sound effects** — oscillators and noise buffers via the Web Audio API (`useSound` composable)
- **Background music** — a lookahead sequencer schedules notes 150 ms ahead for smooth, click-free looping (`useMusic` composable). Each game has a unique track tuned to its mood
- **Mute toggle** — a single 🔊/🔇 button on every game page controls both music and effects; preference is persisted to `localStorage`

## Tech

- **[Nuxt 4](https://nuxt.com)** with the `app/` directory layout
- **Vue 3** Composition API — `<script setup>`, `ref`, `computed`, `watch`
- **Canvas API** — Snake, Space Invaders, Platformer, Rally-X, Scramble, Galaxian, Dig Dug
- **Web Audio API** — all sound and music, zero audio files
- No UI component libraries, no game engines, no audio dependencies

## Multiplayer game framework

All multiplayer games are built on a shared core that handles rooms, players, messaging, and timers. Adding a new multiplayer game means implementing only the game logic — the infrastructure is free.

### Architecture

```
shared/types/core.ts          # BasePlayer, BaseRoomConfig, BaseRoom<TPlayer,TConfig,TPhase>
                              # WinCondition, Language, CoreServerMessage
server/core/roomCore.ts       # broadcast, unicast, setTimer, setInterval_
                              # registerPeer, reconnectPeer, disconnectPeer, reassignHost
                              # startRoomCleaner, genRoomId, genPlayerId
server/games/<name>/
  roomStore.ts                # Game-specific state: extends core types, delegates boilerplate
server/routes/games/<name>/
  ws.ts                       # WebSocket handler — game state machine only
server/api/games/<name>/
  rooms.get.ts                # List public rooms
  rooms.post.ts               # Create a room
  rooms/[roomId].get.ts       # Room info (join validation)
```

### Room configuration (BaseRoomConfig)

Every game's config extends `BaseRoomConfig`:

```ts
interface BaseRoomConfig {
  name: string
  maxPlayers: number
  isPublic: boolean       // appears in the public room list
  language: 'en' | 'sv'
  turnTimerSeconds: number  // 0 = no timer
  bots: number
}
```

### Win conditions

```ts
type WinCondition =
  | { type: 'points';  target: number }   // CAH — first to N awesome points
  | { type: 'chips' }                     // Poker — last player with chips
  | { type: 'score';   target: number }   // Soccer / goal-based games
  | { type: 'rounds';  count: number }    // fixed-round games
```

### Adding a new multiplayer game

1. Create `shared/types/<game>.ts` — extend `BasePlayer`, `BaseRoomConfig`, `BaseRoom`; prefix message types (`<Game>ServerMessage`, `<Game>ClientMessage`)
2. Create `server/games/<game>/roomStore.ts` — import from `../../core/roomCore`, call `startRoomCleaner`, implement game-specific state and logic
3. Create `server/routes/games/<game>/ws.ts` — Nuxt WebSocket handler, implement the state machine
4. Create `server/api/games/<game>/rooms.{get,post}.ts` and `rooms/[roomId].get.ts`
5. Add frontend composables and pages under `app/`

## Use as a Nuxt layer

The package is structured as a portable **Nuxt 4 layer**. Drop it into any Nuxt 4 project and all games appear at `/games/*` without touching your own routes.

### From GitHub (no npm publish needed)

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  extends: ['github:lkrb01/mbl-games'],
})
```

### From a local path

```ts
export default defineNuxtConfig({
  extends: ['../mbl-games'],
})
```

Games will be available at `/games`, `/games/snake`, `/games/scramble`, etc. Your own `/` page is untouched — the layer only adds routes under `/games/`.

## Project structure

```
app/
  pages/
    index.vue                        # Redirects to /games
    games/
      index.vue                      # Game picker hub        →  /games
      cah/
        index.vue                    # CAH lobby              →  /games/cah
        [roomId].vue                 # CAH game room          →  /games/cah/:id
      poker/
        index.vue                    # Poker lobby            →  /games/poker
        [roomId].vue                 # Poker game room        →  /games/poker/:id
      soccer.vue                     #                        →  /games/soccer
      snake.vue                      #                        →  /games/snake
      memory.vue  …                  # (all other single-player games)
  components/
    cah/                             # CAH-specific UI components
    poker/                           # Poker-specific UI components
  composables/
    useCAHSocket.ts                  # CAH WebSocket lifecycle
    useCAHGame.ts                    # CAH reactive state + actions
    usePokerSocket.ts                # Poker WebSocket lifecycle
    usePokerGame.ts                  # Poker reactive state + actions
    useSound.ts                      # Sound effects
    useMusic.ts                      # Background music sequencer
shared/
  types/
    core.ts                          # BasePlayer, BaseRoomConfig, BaseRoom, WinCondition
    cah.ts                           # CAH-specific types (extends core)
    poker.ts                         # Poker-specific types (extends core)
server/
  core/
    roomCore.ts                      # Shared utilities — messaging, timers, player lifecycle
  games/
    cah/
      roomStore.ts                   # CAH in-memory store + game helpers
    poker/
      roomStore.ts                   # Poker in-memory store + game helpers
  routes/games/
    cah/ws.ts                        # CAH WebSocket endpoint
    poker/ws.ts                      # Poker WebSocket endpoint
  api/games/
    cah/rooms.{get,post}.ts          # CAH room API
    cah/rooms/[roomId].get.ts
    poker/rooms.{get,post}.ts        # Poker room API
    poker/rooms/[roomId].get.ts
  utils/
    cahCards.ts                      # Load + shuffle card packs
    pokerHandEvaluator.ts            # 5-card hand evaluation + preflop strength
public/
  cards/cah-base.json                # CAH base card set (90 black, 460 white)
```

> **Note on multiplayer hosting:** Multiplayer games use WebSockets and an in-memory room store — they require a persistent Node.js process. The Docker image and Fly.io deployment satisfy this. Static/edge deployments will serve the UI but multiplayer will not connect.

## Docker

Run the latest image directly — no Node.js installation required:

```bash
docker run -p 3000:3000 lkrb01/mbl-games:latest
```

Then open [http://localhost:3000](http://localhost:3000).

To run on a different port (e.g. 8080):

```bash
docker run -p 8080:3000 lkrb01/mbl-games:latest
```

## Development

```bash
npm install
npm run dev       # http://localhost:3000
```

```bash
npm run build     # Production build
npm run preview   # Preview production build locally
```
