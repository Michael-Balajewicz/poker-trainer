// Opponent decision-making.
//
// Deliberately fast and dumb: a made-hand category, a rough draw count, and
// pot odds. Bots explicitly do NOT run the coach's Monte Carlo -- they have to
// act many times per hand, and they are opponents to practise against, not an
// authority on correct play. That is also why bots/ never imports coach/.

import type { Card } from '../engine/cards.ts'
import { rankOf, suitOf } from '../engine/cards.ts'
import { categoryOf, evaluate7, straightHigh } from '../engine/evaluate.ts'
import { legalActions, potSize } from '../engine/hand.ts'
import type { Action, LegalAction } from '../engine/types.ts'
import type { PlayerView } from '../engine/view.ts'
import { liveOpponents } from '../engine/view.ts'
import type { BotProfile } from './profiles.ts'

/**
 * The Chen formula: a well-known hand-strength heuristic for starting hands.
 * Roughly -1.5 for 72o up to 20 for a pair of aces.
 */
export function chenScore(hole: readonly [Card, Card]): number {
  const first = rankOf(hole[0])
  const second = rankOf(hole[1])
  const high = Math.max(first, second)
  const low = Math.min(first, second)
  const suited = suitOf(hole[0]) === suitOf(hole[1])

  let score = baseValue(high)

  if (first === second) {
    // Pairs are worth double, with a floor -- even deuces play.
    return Math.max(score * 2, 5)
  }

  if (suited) score += 2

  const gap = high - low - 1
  if (gap === 1) score -= 1
  else if (gap === 2) score -= 2
  else if (gap === 3) score -= 4
  else if (gap >= 4) score -= 5

  // Connected low cards make straights more easily.
  if (gap <= 1 && high < 10) score += 1

  return Math.ceil(score)
}

/** Ace 10, king 8, queen 7, jack 6, everything else half its face value. */
function baseValue(rank: number): number {
  if (rank === 12) return 10
  if (rank === 11) return 8
  if (rank === 10) return 7
  if (rank === 9) return 6
  return (rank + 2) / 2
}

/**
 * Rough chance a made hand of each category is currently best against ONE
 * opponent. Crude on purpose -- these drive opponents, not advice.
 */
const CATEGORY_EQUITY = [
  0.17, // high card
  0.4, // pair
  0.6, // two pair
  0.73, // trips
  0.8, // straight
  0.86, // flush
  0.93, // full house
  0.97, // quads
  0.99, // straight flush
]

const suitCountsOf = (cards: readonly Card[]): number[] => {
  const counts = [0, 0, 0, 0]
  for (const card of cards) counts[suitOf(card)]++
  return counts
}

/** Four to a suit, so one more card makes the flush. */
const hasFlushDraw = (cards: readonly Card[]): boolean =>
  suitCountsOf(cards).some((count) => count === 4)

/** How many of the thirteen ranks would complete a straight. 8 = open-ended. */
function straightOuts(cards: readonly Card[]): number {
  let mask = 0
  for (const card of cards) mask |= 1 << rankOf(card)
  if (straightHigh(mask) >= 0) return 0 // already there

  let outs = 0
  for (let rank = 0; rank < 13; rank++) {
    if (mask & (1 << rank)) continue
    if (straightHigh(mask | (1 << rank)) >= 0) outs++
  }
  return outs
}

/** How many players still have to act behind us on this street. */
function playersLeftToAct(view: PlayerView): number {
  const count = view.seats.length
  let left = 0
  for (let i = 1; i < count; i++) {
    const seat = view.seats[(view.heroSeat + i) % count]
    if (seat.status !== 'active') continue
    if (!seat.hasActed || seat.committedThisStreet < view.betToCall) left++
  }
  return left
}

export function decideAction(view: PlayerView, profile: BotProfile, rng: () => number): Action {
  const seat = view.seats[view.heroSeat]
  const legal = legalActions(view)
  const hole = seat.holeCards
  if (hole === null || legal.length === 0) return { type: 'fold' }

  const wanted =
    view.street === 'preflop'
      ? decidePreflop(view, profile, rng, hole)
      : decidePostflop(view, profile, rng, hole)

  // Always reconcile against what is actually legal. A bot returning an
  // illegal raise size is a realistic bug, and the engine would (rightly)
  // throw rather than quietly coerce it.
  return clampToLegal(wanted, legal)
}

function decidePreflop(
  view: PlayerView,
  profile: BotProfile,
  rng: () => number,
  hole: [Card, Card],
): Action {
  const chen = chenScore(hole)
  const behind = playersLeftToAct(view)

  // Fewer players left to act means fewer ways to get beaten, so play wider.
  const positionBonus = behind <= 1 ? 3 : behind <= 3 ? 1.5 : 0
  const facingRaise = view.betToCall > view.bigBlind
  const jitter = (rng() - 0.5) * 2 // keeps play from being perfectly readable
  const bar = profile.chenThreshold - positionBonus + (facingRaise ? 3 : 0) + jitter

  if (chen < bar) return { type: 'fold' }

  if (chen > bar + 5 && rng() < profile.aggression) {
    const to = facingRaise ? view.betToCall * 3 : view.bigBlind * 3
    return { type: 'raise', to: Math.round(to) }
  }

  return { type: 'call' }
}

function decidePostflop(
  view: PlayerView,
  profile: BotProfile,
  rng: () => number,
  hole: [Card, Card],
): Action {
  const seat = view.seats[view.heroSeat]
  const cards = [...hole, ...view.board]
  const madeHand = CATEGORY_EQUITY[categoryOf(evaluate7(cards))]

  // Against more opponents, the same hand is best less often.
  let equity = madeHand ** Math.max(1, liveOpponents(view))

  if (view.street !== 'river') {
    const cardsToCome = view.street === 'flop' ? 2 : 1
    if (hasFlushDraw(cards)) equity += 0.09 * cardsToCome
    equity += 0.022 * straightOuts(cards) * cardsToCome
  }
  equity = Math.min(equity, 0.97)

  const pot = potSize(view)
  const toCall = Math.max(0, view.betToCall - seat.committedThisStreet)

  if (toCall === 0) {
    const bluffing = equity < 0.35 && rng() < profile.bluffFrequency
    if ((equity > 0.62 && rng() < profile.aggression) || bluffing) {
      return { type: 'bet', to: Math.round(pot * 0.6) }
    }
    return { type: 'check' }
  }

  const required = toCall / (pot + toCall)
  if (equity > required + 0.2 && rng() < profile.aggression) {
    return { type: 'raise', to: Math.round(view.betToCall + pot * 0.75) }
  }
  if (equity + profile.callTolerance >= required) return { type: 'call' }
  return { type: 'fold' }
}

/** Turn a desired action into the nearest legal one. */
function clampToLegal(wanted: Action, legal: readonly LegalAction[]): Action {
  const has = (type: LegalAction['type']) => legal.some((option) => option.type === type)
  const fallback = (): Action =>
    has('check') ? { type: 'check' } : has('call') ? { type: 'call' } : { type: 'fold' }

  switch (wanted.type) {
    case 'fold':
      // Never fold when checking is free.
      return has('fold') ? { type: 'fold' } : fallback()
    case 'check':
      return has('check') ? { type: 'check' } : has('call') ? { type: 'call' } : { type: 'fold' }
    case 'call':
      return has('call') ? { type: 'call' } : has('check') ? { type: 'check' } : { type: 'fold' }
    default: {
      const option = legal.find((entry) => entry.type === 'bet' || entry.type === 'raise')
      if (option === undefined || (option.type !== 'bet' && option.type !== 'raise')) {
        return fallback()
      }
      const to = Math.round(Math.min(Math.max(wanted.to, option.min), option.max))
      return { type: option.type, to }
    }
  }
}
