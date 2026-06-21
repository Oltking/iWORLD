/**
 * The iWORLD Arena ladder — default champion agents that are always present to duel,
 * so a solo player never needs a second human. Each has a distinct fighting style
 * (so matchups are real) and a level (so there's a ladder to climb). These double as
 * the leaderboard of the strongest — beat the ones above you and you rise past them.
 */
import { styleFromText, type Fighter } from './arena'

export interface Champion extends Fighter {
  id: string
  title: string
  level: number
  icon: string
}

const ROSTER: { id: string; name: string; title: string; level: number; icon: string; text: string }[] = [
  { id: 'pebble', name: 'Pebble', title: 'the Novice', level: 2, icon: '🪨', text: 'careful steady gentle calm' },
  { id: 'sprout', name: 'Sprout', title: 'the Eager', level: 3, icon: '🌱', text: 'energetic fast charge bold' },
  { id: 'vex', name: 'Vex', title: 'the Cunning', level: 5, icon: '🦊', text: 'sly witty cunning tricky playful dry' },
  { id: 'stoneward', name: 'Stoneward', title: 'the Patient', level: 7, icon: '🛡️', text: 'calm patient grounded steady careful' },
  { id: 'blaze', name: 'Blaze', title: 'the Swift', level: 9, icon: '🔥', text: 'bold energetic fierce fast charge attack' },
  { id: 'echo', name: 'Echo', title: 'the Mirror', level: 12, icon: '🌫️', text: 'honest thoughtful listens reacts perspective' },
  { id: 'onyx', name: 'Onyx Warden', title: 'the Unbroken', level: 15, icon: '🗿', text: 'strong direct brave clever guard counter' },
  { id: 'nyx', name: 'Nyx', title: 'the Undefeated', level: 20, icon: '🌑', text: 'sharp cunning fierce bold clever trick' },
]

export function champions(): Champion[] {
  return ROSTER.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    level: c.level,
    icon: c.icon,
    style: styleFromText(c.text),
  }))
}
