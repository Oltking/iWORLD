/**
 * Debate Arena — the first "mind" game. Your agent argues a motion using its real
 * personality (live TEE inference via the shared pool), against a house opponent. A
 * neutral TEE-run judge scores both and declares a winner; the transcript is public and
 * the verdict hash can be anchored on-chain. Reputation, not wagering.
 */
import { keccak256, toUtf8Bytes, type JsonRpcSigner } from 'ethers'
import type { PersonalityConfig } from '@kipr/core/personality'
import { relayChat } from './compute-relay'
import type { ChatMessage } from './compute'

export const MOTIONS = [
  'Privacy is worth more than convenience.',
  'It is better to be feared than to be loved.',
  'AI companions make people less lonely, not more.',
  'Honesty should never be sacrificed for kindness.',
  'A small life well-lived beats a famous one.',
  'We should trust the crowd over the expert.',
  'Owning your data matters more than free services.',
  'Boredom is good for you.',
] as const

export interface DebateOpponent {
  id: string
  name: string
  icon: string
  persona: string
}

export const DEBATE_OPPONENTS: DebateOpponent[] = [
  { id: 'sage', name: 'Sage', icon: '🦉', persona: 'a calm, rigorous logician who wins with airtight reasoning and crisp structure' },
  { id: 'blaze', name: 'Blaze', icon: '🔥', persona: 'a fiery rhetorician who wins with vivid imagery, passion, and bold moral claims' },
  { id: 'quill', name: 'Quill', icon: '🪶', persona: 'a witty, urbane debater who wins with sharp one-liners and clever reframes' },
]

export interface DebateLine {
  speaker: string
  side: 'for' | 'against'
  text: string
  round: number
}

export interface Verdict {
  you: number
  opp: number
  winner: 'you' | 'opp' | 'tie'
  reason: string
}

export interface DebateResult {
  lines: DebateLine[]
  verdict: Verdict
  transcriptHash: string
}

const STYLE = 'Speak in first person, 2-3 vivid sentences. No preamble, no stage directions, stay in character.'

async function speak(signer: JsonRpcSigner, system: string, user: string): Promise<string> {
  const msgs: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const res = await relayChat(signer, msgs)
  return res.content.trim()
}

function parseVerdict(raw: string): Verdict {
  try {
    const m = raw.match(/\{[\s\S]*\}/)
    const j = JSON.parse(m ? m[0] : raw) as { a?: number; b?: number; winner?: string; reason?: string }
    const you = Math.max(0, Math.min(10, Number(j.a)))
    const opp = Math.max(0, Math.min(10, Number(j.b)))
    const winner = j.winner === 'a' ? 'you' : j.winner === 'b' ? 'opp' : you > opp ? 'you' : opp > you ? 'opp' : 'tie'
    return { you, opp, winner, reason: String(j.reason ?? '').slice(0, 220) }
  } catch {
    return { you: 5, opp: 5, winner: 'tie', reason: 'The judge couldn’t reach a clear decision.' }
  }
}

/** Run a full 2-round debate + neutral judging. onLine streams each statement as it lands. */
export async function runDebate(
  signer: JsonRpcSigner,
  me: { name: string; config: PersonalityConfig },
  opp: DebateOpponent,
  motion: string,
  onLine?: (line: DebateLine) => void,
): Promise<DebateResult> {
  const lines: DebateLine[] = []
  const push = (l: DebateLine) => {
    lines.push(l)
    onLine?.(l)
  }

  const mySys = `${me.config.systemPrompt}\nYou are now in a formal debate, arguing FOR the motion: "${motion}". ${STYLE}`
  const oppSys = `You are ${opp.name}, ${opp.persona}. You are in a formal debate, arguing AGAINST the motion: "${motion}". ${STYLE}`

  const myOpen = await speak(signer, mySys, `Give your opening argument FOR: "${motion}".`)
  push({ speaker: me.name, side: 'for', text: myOpen, round: 1 })

  const oppOpen = await speak(signer, oppSys, `Give your opening argument AGAINST: "${motion}".`)
  push({ speaker: opp.name, side: 'against', text: oppOpen, round: 1 })

  const myReb = await speak(signer, mySys, `Your opponent argued: "${oppOpen}". Rebut them and strengthen your case.`)
  push({ speaker: me.name, side: 'for', text: myReb, round: 2 })

  const oppReb = await speak(signer, oppSys, `Your opponent argued: "${myReb}". Rebut them and strengthen your case.`)
  push({ speaker: opp.name, side: 'against', text: oppReb, round: 2 })

  const transcript = lines.map((l) => `${l.speaker} (${l.side}): ${l.text}`).join('\n')
  const judgeSys =
    'You are a neutral, discerning debate judge. Score each debater 0-10 on persuasion, logic, and clarity combined. ' +
    'Respond with ONLY compact JSON: {"a":<0-10>,"b":<0-10>,"winner":"a"|"b"|"tie","reason":"<one sentence>"}.'
  const judgeUser = `Motion: "${motion}".\nDebater A = ${me.name} (FOR).\nDebater B = ${opp.name} (AGAINST).\nTranscript:\n${transcript}\n\nScore them now.`
  const raw = await speak(signer, judgeSys, judgeUser)

  return {
    lines,
    verdict: parseVerdict(raw),
    transcriptHash: keccak256(toUtf8Bytes(`${motion}|${transcript}`)),
  }
}

export const randomMotion = (): string => MOTIONS[Math.floor(Math.random() * MOTIONS.length)]
