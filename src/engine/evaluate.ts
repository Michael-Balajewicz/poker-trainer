// Seven-card hand evaluation.
//
// Scores a hand as a single integer so two hands compare with a plain `>`:
//
//   score = (category << 20) | (t1 << 16) | (t2 << 12) | (t3 << 8) | (t4 << 4) | t5
//
// The category is 0..8 and each tiebreaker is a rank index 0..12, so every
// field fits in 4 bits and the whole score stays well inside a 32-bit int.
//
// Because all five contributing cards are encoded, ties and kickers need no
// special handling anywhere else in the codebase: equal scores mean an exact
// tie, which means a split pot. A counterfeited kicker is automatic too --
// we always take the best five of seven, so if the board outruns your kicker,
// the board's card is simply the one that lands in the score.
//
// The implementation deliberately does NOT enumerate the 21 five-card subsets.
// It makes one pass over the seven cards building bitmasks and counts. That is
// roughly 10x faster, which is what lets the coach's Monte Carlo run thousands
// of hands on the main thread without needing a Web Worker.

import type { Card } from './cards.ts'
import { rankOf, suitOf } from './cards.ts'

// Plain consts rather than a TS enum: tsconfig sets erasableSyntaxOnly, which
// forbids enums because they emit real runtime code.
export const STRAIGHT_FLUSH = 8
export const FOUR_OF_A_KIND = 7
export const FULL_HOUSE = 6
export const FLUSH = 5
export const STRAIGHT = 4
export const THREE_OF_A_KIND = 3
export const TWO_PAIR = 2
export const ONE_PAIR = 1
export const HIGH_CARD = 0

/** Pack a category and up to five rank tiebreakers into one comparable int. */
export function packScore(category: number, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0): number {
  return (category << 20) | (t1 << 16) | (t2 << 12) | (t3 << 8) | (t4 << 4) | t5
}

export const categoryOf = (score: number): number => score >> 20

/**
 * Highest straight in a 13-bit rank mask, as a rank index, or -1 for none.
 *
 * The ace has to play at both ends, so we build a 14-bit mask where bit 0 is
 * the ace playing low and bits 1..13 are 2..A. Five consecutive set bits mean
 * a straight, and ANDing the mask with four shifted copies of itself leaves a
 * bit set exactly where such a run begins.
 */
export function straightHigh(rankMask: number): number {
  const shifted = (rankMask << 1) | ((rankMask >> 12) & 1)
  const runs = shifted & (shifted >> 1) & (shifted >> 2) & (shifted >> 3) & (shifted >> 4)
  if (runs === 0) return -1
  // Highest set bit = the start of the highest run. Its top card sits four
  // bits up and the mask is offset by one, so the rank index is start + 3.
  //
  // The wheel (A2345) starts at bit 0 and yields rank index 3 -- a FIVE, not
  // an ace. That is what makes it correctly lose to a six-high straight.
  const start = 31 - Math.clz32(runs)
  return start + 3
}

/** The n highest ranks present in a 13-bit mask, descending. */
function topRanks(rankMask: number, n: number): number[] {
  const out: number[] = []
  for (let rank = 12; rank >= 0 && out.length < n; rank--) {
    if (rankMask & (1 << rank)) out.push(rank)
  }
  return out
}

/** The n highest ranks present, skipping ranks already used by the hand. */
function topKickers(rankCounts: readonly number[], used: readonly number[], n: number): number[] {
  const out: number[] = []
  for (let rank = 12; rank >= 0 && out.length < n; rank--) {
    if (rankCounts[rank] > 0 && !used.includes(rank)) out.push(rank)
  }
  return out
}

/**
 * Score the best five-card hand contained in exactly seven cards.
 * Higher is better. Compare two scores with `>`; equal means a genuine tie.
 */
export function evaluate7(cards: readonly Card[]): number {
  const rankCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const suitCounts = [0, 0, 0, 0]
  const suitMasks = [0, 0, 0, 0]
  let rankMask = 0

  for (const card of cards) {
    const rank = rankOf(card)
    const suit = suitOf(card)
    rankCounts[rank]++
    suitCounts[suit]++
    suitMasks[suit] |= 1 << rank
    rankMask |= 1 << rank
  }

  // With only seven cards at most one suit can reach five, so there is never
  // any ambiguity about which suit the flush is in.
  let flushSuit = -1
  for (let suit = 0; suit < 4; suit++) {
    if (suitCounts[suit] >= 5) {
      flushSuit = suit
      break
    }
  }

  if (flushSuit >= 0) {
    // Running the same straight routine over just the flush suit's cards gets
    // straight flushes -- and the steel wheel -- for free.
    const high = straightHigh(suitMasks[flushSuit])
    if (high >= 0) return packScore(STRAIGHT_FLUSH, high)
  }

  // Collect rank groups once, highest rank first.
  let quadRank = -1
  const tripRanks: number[] = []
  const pairRanks: number[] = []
  for (let rank = 12; rank >= 0; rank--) {
    const count = rankCounts[rank]
    if (count === 4) quadRank = rank
    else if (count === 3) tripRanks.push(rank)
    else if (count === 2) pairRanks.push(rank)
  }

  if (quadRank >= 0) {
    const kicker = topKickers(rankCounts, [quadRank], 1)[0]
    return packScore(FOUR_OF_A_KIND, quadRank, kicker)
  }

  if (tripRanks.length > 0) {
    // Seven cards can hold two sets (3+3+1), in which case the lower set plays
    // as the pair. Otherwise the best actual pair does.
    let pairRank = tripRanks.length > 1 ? tripRanks[1] : -1
    if (pairRanks.length > 0 && pairRanks[0] > pairRank) pairRank = pairRanks[0]
    if (pairRank >= 0) return packScore(FULL_HOUSE, tripRanks[0], pairRank)
  }

  // Checked after the full house so a hand holding both scores as the boat.
  if (flushSuit >= 0) {
    const best = topRanks(suitMasks[flushSuit], 5)
    return packScore(FLUSH, best[0], best[1], best[2], best[3], best[4])
  }

  const straight = straightHigh(rankMask)
  if (straight >= 0) return packScore(STRAIGHT, straight)

  if (tripRanks.length > 0) {
    const kickers = topKickers(rankCounts, [tripRanks[0]], 2)
    return packScore(THREE_OF_A_KIND, tripRanks[0], kickers[0], kickers[1])
  }

  if (pairRanks.length >= 2) {
    // Three pairs is possible with seven cards. The unused pair is still a
    // candidate kicker, and topKickers picks it up because it only skips the
    // two ranks actually playing.
    const high = pairRanks[0]
    const low = pairRanks[1]
    const kicker = topKickers(rankCounts, [high, low], 1)[0]
    return packScore(TWO_PAIR, high, low, kicker)
  }

  if (pairRanks.length === 1) {
    const kickers = topKickers(rankCounts, [pairRanks[0]], 3)
    return packScore(ONE_PAIR, pairRanks[0], kickers[0], kickers[1], kickers[2])
  }

  const best = topRanks(rankMask, 5)
  return packScore(HIGH_CARD, best[0], best[1], best[2], best[3], best[4])
}

const RANK_NAME = [
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
  'Ace',
]

const RANK_PLURAL = [
  'Twos',
  'Threes',
  'Fours',
  'Fives',
  'Sixes',
  'Sevens',
  'Eights',
  'Nines',
  'Tens',
  'Jacks',
  'Queens',
  'Kings',
  'Aces',
]

/** Human-readable hand name, e.g. 'Two pair, Aces and Sevens'. */
export function describeScore(score: number): string {
  const category = categoryOf(score)
  const t1 = (score >> 16) & 0xf
  const t2 = (score >> 12) & 0xf

  switch (category) {
    case STRAIGHT_FLUSH:
      return t1 === 12 ? 'Royal flush' : `Straight flush, ${RANK_NAME[t1]}-high`
    case FOUR_OF_A_KIND:
      return `Four of a kind, ${RANK_PLURAL[t1]}`
    case FULL_HOUSE:
      return `Full house, ${RANK_PLURAL[t1]} full of ${RANK_PLURAL[t2]}`
    case FLUSH:
      return `Flush, ${RANK_NAME[t1]}-high`
    case STRAIGHT:
      return `Straight, ${RANK_NAME[t1]}-high`
    case THREE_OF_A_KIND:
      return `Three of a kind, ${RANK_PLURAL[t1]}`
    case TWO_PAIR:
      return `Two pair, ${RANK_PLURAL[t1]} and ${RANK_PLURAL[t2]}`
    case ONE_PAIR:
      return `Pair of ${RANK_PLURAL[t1]}, ${RANK_NAME[t2]} kicker`
    default:
      return `${RANK_NAME[t1]}-high, ${RANK_NAME[t2]} kicker`
  }
}
