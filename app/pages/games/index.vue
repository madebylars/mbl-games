<template>
  <div class="home">
    <header class="hero">
      <p class="subtitle">Games</p>
    </header>

    <main class="grid">
      <NuxtLink v-for="game in games" :key="game.slug" :to="`/games/${game.slug}`" class="card">

        <div class="card-icon-row">
          <div class="card-icon">{{ game.icon }}</div>
          <div v-if="game.slug === 'cah'" class="lang-toggle" @click.stop.prevent>
            <button
              class="lang-btn"
              :class="{ active: cahLang === 'en' }"
              title="English"
              @click.stop.prevent="setCahLang('en')"
            >🇬🇧</button>
            <button
              class="lang-btn"
              :class="{ active: cahLang === 'sv' }"
              title="Svenska"
              @click.stop.prevent="setCahLang('sv')"
            >🇸🇪</button>
          </div>
        </div>
        <h2 class="card-title">{{ game.slug === 'cah' ? cahContent.name : game.name }}</h2>
        <p class="card-desc">{{ game.slug === 'cah' ? cahContent.desc : game.description }}</p>
        <span class="card-cta">Play →</span>
      </NuxtLink>
    </main>
  </div>
</template>

<script setup lang="ts">
// ── CAH language toggle ────────────────────────────────────────────────────────
const cahLang = ref<'en' | 'sv'>('en')
onMounted(() => {
  cahLang.value = (localStorage.getItem('cah-lang') as 'en' | 'sv') ?? 'en'
})

const CAH_CONTENT = {
  en: {
    name: 'Appropriately Disgusting',
    desc: 'Unfiltered. Unapologetic. Unforgettable. Create or join a room and fill in the blanks — the most wrong answer wins.',
  },
  sv: {
    name: 'Lagom Äckligt',
    desc: 'Ofiltrerat. Oursäktat. Oförglömligt. Skapa eller gå med i ett rum och fyll i luckorna — det mest fel svar vinner.',
  },
}

const cahContent = computed(() => CAH_CONTENT[cahLang.value])

function setCahLang(lang: 'en' | 'sv') {
  cahLang.value = lang
  localStorage.setItem('cah-lang', lang)
}

// ── Game list ──────────────────────────────────────────────────────────────────
const games = [
  {
    slug: 'cah',
    name: '',        // overridden by cahContent
    icon: '🃏',
    description: '', // overridden by cahContent
  },
  {
    slug: 'poker',
    name: 'Texas Hold\'em',
    icon: '♠️',
    description: 'Real multiplayer Texas Hold\'em poker — play against friends or bots with private/public tables, blinds, all-ins and full hand evaluation.',
  },
  {
    slug: 'snake',
    name: 'Snake',
    icon: '🐍',
    description: 'Guide the snake, eat food and grow — but don\'t hit the walls or yourself.',
  },
  {
    slug: 'memory',
    name: 'Memory',
    icon: '🃏',
    description: 'Flip cards and match all pairs in as few moves as possible.',
  },
  {
    slug: 'quiz',
    name: 'Quiz',
    icon: '🧠',
    description: 'Answer 10 questions across topics and see how many you can get right.',
  },
  {
    slug: '2048',
    name: '2048',
    icon: '🔢',
    description: 'Slide tiles and merge matching numbers to reach the 2048 tile.',
  },
  {
    slug: 'space-invaders',
    name: 'Space Invaders',
    icon: '👾',
    description: 'Shoot down waves of alien invaders before they reach the ground.',
  },
  {
    slug: 'galaxian',
    name: 'Galaxian',
    icon: '🛸',
    description: 'Defend against alien formations that break ranks and dive-bomb your ship.',
  },
  {
    slug: 'rally-x',
    name: 'Rally-X',
    icon: '🚗',
    description: 'Drive through the maze, collect all flags, and use smoke to shake off enemy cars.',
  },
  {
    slug: 'platformer',
    name: 'Platformer',
    icon: '🏃',
    description: 'Run, jump and collect coins. Stomp enemies and survive as long as you can!',
  },
  {
    slug: 'scramble',
    name: 'Scramble',
    icon: '🚀',
    description: 'Fly through scrolling enemy terrain, bomb fuel depots to stay airborne, and destroy the base.',
  },
  {
    slug: 'dig-dug',
    name: 'Dig Dug',
    icon: '⛏️',
    description: 'Tunnel through the earth, inflate enemies with your pump, and drop boulders to crush them.',
  },
  {
    slug: 'soccer',
    name: 'Soccer',
    icon: '⚽',
    description: 'Penalty shootout, free kick challenge or goalkeeper — pick your mode and hit the pitch.',
  },
  {
    slug: 'animal-count',
    name: 'Animal Count',
    icon: '🔢',
    description: 'Count the animals on screen and tap the right number. Great for little ones!',
  },
  {
    slug: 'spell-the-animal',
    name: 'Spell the Animal',
    icon: '🔤',
    description: 'Look at the animal and tap the letters to spell its name.',
  },
]
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  background: radial-gradient(ellipse at top, #1e1b4b 0%, #0f0f1a 60%);
}

.hero {
  text-align: center;
  margin-bottom: 40px;
}

.logo {
  height: clamp(60px, 14vw, 96px);
  width: auto;
}

.subtitle {
  margin-top: 4px;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: #94a3b8;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  width: 100%;
  max-width: 900px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 32px 28px;
  background: #1e1e2e;
  border: 1px solid #2d2d44;
  border-radius: 16px;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  cursor: pointer;
}

.card:hover {
  transform: translateY(-4px);
  border-color: #818cf8;
  box-shadow: 0 8px 32px rgba(129, 140, 248, 0.2);
}

.card-icon {
  font-size: 2.5rem;
  line-height: 1;
}

.card-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f1f5f9;
}

.card-desc {
  font-size: 0.925rem;
  color: #94a3b8;
  line-height: 1.6;
  flex: 1;
}

.card-cta {
  font-size: 0.9rem;
  font-weight: 600;
  color: #818cf8;
  margin-top: 4px;
}

.card-icon-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lang-toggle {
  display: flex;
  gap: 6px;
}

.lang-btn {
  font-size: 1.25rem;
  line-height: 1;
  padding: 4px 6px;
  background: #0f0f1a;
  border: 1px solid #2d2d44;
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s, border-color 0.15s;
}

.lang-btn:hover {
  opacity: 0.75;
}

.lang-btn.active {
  opacity: 1;
  border-color: #818cf8;
}

</style>
