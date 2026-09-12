// Preflop range charts.
//
// Preflop is where beginners leak the most, and it is also where equity alone
// gives bad advice -- raw equity ignores position and what happens on later
// streets. So preflop the coach uses a chart instead, the same way a human
// learns: "this is a standard button open".
//
// Ranges are written in the notation poker players actually use, so they are
// easy to read and easy to edit:
//   77+   every pair from sevens up
//   ATs+  AT, AJ, AQ, AK suited
//   KQo   exactly king-queen offsuit
//
// These are reasonable full-ring opening ranges, not solver output. See the
// limitations panel in the UI.

import type { Card } from '../engine/cards.ts'
import { RANKS, rankOf, suitOf } from '../engine/cards.ts'

export type PositionBucket = 'EP' | 'MP' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB'

/** Canonical name for a starting hand: 'AA', 'AKs', 'T9o'. */
export function handKey(hole: readonly [Card, Card]): string {
  const first = rankOf(hole[0])
  const second = rankOf(hole[1])
  const high = Math.max(first, second)
  const low = Math.min(first, second)
  if (high === low) return RANKS[high] + RANKS[low]
  return RANKS[high] + RANKS[low] + (suitOf(hole[0]) === suitOf(hole[1]) ? 's' : 'o')
}

/** Expand one notation entry into the hands it covers. */
function expand(notation: string): string[] {
  const open = notation.endsWith('+')
  const base = open ? notation.slice(0, -1) : notation
  if (!open) return [base]

  const high = RANKS.indexOf(base[0])
  const low = RANKS.indexOf(base[1])
  const suffix = base.length > 2 ? base[2] : ''
  const hands: string[] = []

  if (high === low) {
    // 77+ climbs the pairs to aces.
    for (let rank = low; rank <= 12; rank++) hands.push(RANKS[rank] + RANKS[rank])
  } else {
    // ATs+ keeps the ace and climbs the second card towards it.
    for (let rank = low; rank < high; rank++) hands.push(RANKS[high] + RANKS[rank] + suffix)
  }
  return hands
}

const toSet = (notations: readonly string[]): Set<string> =>
  new Set(notations.flatMap(expand))

/** Hands worth opening for a raise when nobody has raised yet. */
const OPEN: Record<PositionBucket, Set<string>> = {
  EP: toSet(['77+', 'ATs+', 'KQs', 'AQo+']),
  MP: toSet(['66+', 'A9s+', 'KJs+', 'QJs', 'AJo+', 'KQo']),
  HJ: toSet(['55+', 'A8s+', 'KTs+', 'QTs', 'JTs', 'ATo+', 'KQo']),
  CO: toSet(['44+', 'A5s+', 'K9s+', 'Q9s', 'J9s', 'T9s', 'ATo+', 'KJo+']),
  BTN: toSet([
    '22+', 'A2s+', 'K7s+', 'Q8s+', 'J8s+', 'T8s+', '97s+', '87s',
    'A8o+', 'KTo+', 'QTo+', 'JTo',
  ]),
  SB: toSet(['22+', 'A2s+', 'K8s+', 'Q9s+', 'J9s+', 'T9s', 'A9o+', 'KJo+', 'QJo']),
  BB: toSet(['22+', 'A2s+', 'K8s+', 'Q9s+', 'J9s+', 'T9s', 'A9o+', 'KJo+', 'QJo']),
}

/** Hands worth continuing with when someone has already raised. */
const DEFEND: Record<PositionBucket, Set<string>> = {
  EP: toSet(['TT+', 'AQs+', 'AKo']),
  MP: toSet(['99+', 'AJs+', 'KQs', 'AQo+']),
  HJ: toSet(['88+', 'ATs+', 'KJs+', 'AQo+']),
  CO: toSet(['77+', 'A9s+', 'KTs+', 'QJs', 'AJo+']),
  BTN: toSet(['55+', 'A8s+', 'K9s+', 'QTs+', 'JTs', 'ATo+', 'KQo']),
  SB: toSet(['77+', 'ATs+', 'KJs+', 'AQo+']),
  // The big blind already has a bet in, so it gets a discount and defends wide.
  BB: toSet([
    '22+', 'A2s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', 'A9o+', 'KJo+', 'QJo',
  ]),
}

/** Strong enough to put in a third raise, wherever you are sitting. */
const RERAISE = toSet(['JJ+', 'AKs', 'AKo'])

/** Map a position label from the table to a chart bucket. */
export function bucketFor(position: string | null): PositionBucket {
  switch (position) {
    case 'BTN':
      return 'BTN'
    case 'SB':
      return 'SB'
    case 'BB':
      return 'BB'
    case 'CO':
      return 'CO'
    case 'HJ':
      return 'HJ'
    case 'LJ':
      return 'MP'
    default:
      // UTG, UTG+1, UTG+2 and anything unexpected: play it tight.
      return 'EP'
  }
}

export type ChartCall = {
  hand: string
  bucket: PositionBucket
  recommended: 'raise' | 'call' | 'check' | 'fold'
  reason: string
}

export function consultChart(args: {
  hole: readonly [Card, Card]
  bucket: PositionBucket
  facingRaise: boolean
  canCheck: boolean
}): ChartCall {
  const { hole, bucket, facingRaise, canCheck } = args
  const hand = handKey(hole)

  if (facingRaise) {
    if (RERAISE.has(hand)) {
      return {
        hand,
        bucket,
        recommended: 'raise',
        reason: `${hand} is strong enough to re-raise from any position.`,
      }
    }
    if (DEFEND[bucket].has(hand)) {
      return {
        hand,
        bucket,
        recommended: 'call',
        reason: `${hand} is inside a standard ${bucket} continuing range against a raise.`,
      }
    }
    return {
      hand,
      bucket,
      recommended: canCheck ? 'check' : 'fold',
      reason: `${hand} is not strong enough to continue against a raise from ${bucket}.`,
    }
  }

  if (OPEN[bucket].has(hand)) {
    return {
      hand,
      bucket,
      recommended: 'raise',
      reason: `${hand} is a standard ${bucket} open. Raising takes the initiative and can win the blinds outright.`,
    }
  }

  if (canCheck) {
    return {
      hand,
      bucket,
      recommended: 'check',
      reason: `${hand} is not worth raising from ${bucket}, but checking is free.`,
    }
  }

  return {
    hand,
    bucket,
    recommended: 'fold',
    reason: `${hand} is outside a standard ${bucket} opening range. Playing weak hands out of position is the most common losing habit.`,
  }
}
