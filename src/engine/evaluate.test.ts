import { describe, expect, it } from 'vitest'
import type { Card } from './cards.ts'
import { makeDeck, parseCards, rankOf, suitOf } from './cards.ts'
import {
  FLUSH,
  FOUR_OF_A_KIND,
  FULL_HOUSE,
  ONE_PAIR,
  STRAIGHT,
  STRAIGHT_FLUSH,
  THREE_OF_A_KIND,
  TWO_PAIR,
  categoryOf,
  describeScore,
  evaluate7,
  packScore,
} from './evaluate.ts'
import { mulberry32, shuffle } from './rng.ts'

const score = (text: string) => evaluate7(parseCards(text))

describe('hand categories', () => {
  it('recognises each category', () => {
    expect(categoryOf(score('As Ks Qs Js Ts 2c 3d'))).toBe(STRAIGHT_FLUSH)
    expect(categoryOf(score('As Ac Ah Ad Kc Qd 2h'))).toBe(FOUR_OF_A_KIND)
    expect(categoryOf(score('9c 9d 9h 8c 8d 8s Ac'))).toBe(FULL_HOUSE)
    expect(categoryOf(score('Ah Kh Qh 2h 3h 7s 8d'))).toBe(FLUSH)
    expect(categoryOf(score('Ac Kd Qh Js Tc 3d 4h'))).toBe(STRAIGHT)
    expect(categoryOf(score('7c 7d 7h Ac Kd 3s 2h'))).toBe(THREE_OF_A_KIND)
    expect(categoryOf(score('Ac Ad 7h 7s Kd 3c 2h'))).toBe(TWO_PAIR)
    expect(categoryOf(score('4c 4d Ah Ks 9d 3c 2h'))).toBe(ONE_PAIR)
  })
})

describe('straights and the wheel', () => {
  it('treats A2345 as a straight', () => {
    expect(categoryOf(score('Ac 2d 3h 4s 5c Kd Qh'))).toBe(STRAIGHT)
  })

  it('scores the wheel as five-high, so it loses to a six-high straight', () => {
    const wheel = score('Ac 2d 3h 4s 5c Kd Qh')
    const sixHigh = score('2d 3h 4s 5c 6d Kh Qs')
    expect(sixHigh).toBeGreaterThan(wheel)
    expect(describeScore(wheel)).toBe('Straight, Five-high')
  })

  it('finds the steel wheel straight flush', () => {
    const steel = score('As 2s 3s 4s 5s Kd Qh')
    expect(categoryOf(steel)).toBe(STRAIGHT_FLUSH)
    expect(describeScore(steel)).toBe('Straight flush, Five-high')
  })

  it('names a broadway straight flush a royal flush', () => {
    expect(describeScore(score('As Ks Qs Js Ts 2c 3d'))).toBe('Royal flush')
  })

  it('takes the highest straight when six cards run together', () => {
    // 5 through T all present -- the best straight is ten-high, not nine-high.
    expect(describeScore(score('5c 6d 7h 8s 9c Td 2h'))).toBe('Straight, Ten-high')
  })
})

describe('category precedence within one hand', () => {
  it('prefers a flush over a straight held in the same seven cards', () => {
    // Hearts A K Q 3 2 make a flush; A K Q J T also make a straight.
    const hand = score('Ah Kh Qh 2h 3h Js Td')
    expect(categoryOf(hand)).toBe(FLUSH)
  })

  it('prefers a full house over trips when a pair is also present', () => {
    expect(categoryOf(score('9c 9d 9h Kc Kd 3s 2h'))).toBe(FULL_HOUSE)
  })

  // A flush and a full house cannot coexist in exactly seven cards: the flush
  // uses five distinct ranks in one suit, and the two remaining cards cannot
  // supply both trips and a pair. So the ordering is checked across hands.
  it('ranks a full house above a flush', () => {
    expect(score('9c 9d 9h Kc Kd 3s 2h')).toBeGreaterThan(score('Ah Kh Qh 2h 3h 7s 8d'))
  })

  it('ranks the categories in the conventional order', () => {
    const ordered = [
      score('7c 5d Ah Ks 9d 3c 2h'), // high card
      score('4c 4d Ah Ks 9d 3c 2h'), // pair
      score('Ac Ad 7h 7s Kd 3c 2h'), // two pair
      score('7c 7d 7h Ac Kd 3s 2h'), // trips
      score('Ac Kd Qh Js Tc 3d 4h'), // straight
      score('Ah Kh Qh 2h 3h 7s 8d'), // flush
      score('9c 9d 9h 8c 8d 8s Ac'), // full house
      score('As Ac Ah Ad Kc Qd 2h'), // quads
      score('As Ks Qs Js Ts 2c 3d'), // straight flush
    ]
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThan(ordered[i - 1])
    }
  })
})

describe('kickers, ties and split pots', () => {
  it('builds the boat from the higher of two sets', () => {
    expect(describeScore(score('9c 9d 9h 8c 8d 8s Ac'))).toBe('Full house, Nines full of Eights')
  })

  it('picks the best kicker alongside quads', () => {
    expect(score('As Ac Ah Ad Kc Qd 2h')).toBe(packScore(FOUR_OF_A_KIND, 12, 11))
  })

  it('plays the third pair as a kicker when three pairs are present', () => {
    // Aces and kings play, and the queen from the third pair is the kicker --
    // not the deuce.
    expect(score('Ac Ad Kc Kd Qc Qd 2h')).toBe(packScore(TWO_PAIR, 12, 11, 10))
  })

  it('splits when the board plays for both players', () => {
    const board = 'Ah Kd Qc Js Td'
    expect(score(`2c 3d ${board}`)).toBe(score(`4h 5s ${board}`))
  })

  it('splits when both players are counterfeited by the board', () => {
    const board = '2c 2d 9h 9s Ac'
    expect(score(`6c 5d ${board}`)).toBe(score(`8h 7s ${board}`))
  })

  it('lets the kicker decide between two players with the same pair', () => {
    const board = 'Ah 7d 4c 2s 9h'
    expect(score(`As Ks ${board}`)).toBeGreaterThan(score(`Ad Qd ${board}`))
  })

  it('decides flush versus flush on the fifth card', () => {
    const board = 'Ah 9h 5h 2h 3c'
    expect(score(`Kh Qd ${board}`)).toBeGreaterThan(score(`Jh Td ${board}`))
  })
})

// ---------------------------------------------------------------------------
// Differential test.
//
// A deliberately naive reference implementation: enumerate all 21 five-card
// subsets, score each by sorting and counting, and take the best. It shares no
// code path with the bitmask version, so agreement between the two over many
// random hands is strong evidence both are right. It lives here and never
// ships.
// ---------------------------------------------------------------------------

const FIVE_CARD_SUBSETS: number[][] = []
for (let a = 0; a < 7; a++)
  for (let b = a + 1; b < 7; b++)
    for (let c = b + 1; c < 7; c++)
      for (let d = c + 1; d < 7; d++)
        for (let e = d + 1; e < 7; e++) FIVE_CARD_SUBSETS.push([a, b, c, d, e])

function referenceEvaluate5(cards: readonly Card[]): number {
  const ranks = cards.map(rankOf).sort((x, y) => y - x)
  const suits = cards.map(suitOf)
  const isFlush = suits.every((s) => s === suits[0])

  const unique = [...new Set(ranks)]
  let straightTop = -1
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightTop = unique[0]
    // A5432: the ace plays low and the five is the top card.
    else if (unique[0] === 12 && unique[1] === 3) straightTop = 3
  }

  const counts = new Map<number, number>()
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1)
  // Sort by how many of that rank, then by rank -- so groups[0] is the most
  // significant part of the hand.
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])
  const at = (i: number) => groups[i][0]

  if (isFlush && straightTop >= 0) return packScore(STRAIGHT_FLUSH, straightTop)
  if (groups[0][1] === 4) return packScore(FOUR_OF_A_KIND, at(0), at(1))
  if (groups[0][1] === 3 && groups[1][1] === 2) return packScore(FULL_HOUSE, at(0), at(1))
  if (isFlush) return packScore(FLUSH, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
  if (straightTop >= 0) return packScore(STRAIGHT, straightTop)
  if (groups[0][1] === 3) return packScore(THREE_OF_A_KIND, at(0), at(1), at(2))
  if (groups[0][1] === 2 && groups[1][1] === 2) return packScore(TWO_PAIR, at(0), at(1), at(2))
  if (groups[0][1] === 2) return packScore(ONE_PAIR, at(0), at(1), at(2), at(3))
  return packScore(HIGH_CARD_CATEGORY, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4])
}

const HIGH_CARD_CATEGORY = 0

function referenceEvaluate7(cards: readonly Card[]): number {
  let best = -1
  for (const subset of FIVE_CARD_SUBSETS) {
    const five = subset.map((i) => cards[i])
    const value = referenceEvaluate5(five)
    if (value > best) best = value
  }
  return best
}

describe('differential test against a naive 21-subset oracle', () => {
  it('agrees on 10,000 random seven-card hands', () => {
    const rng = mulberry32(0xc0ffee)
    const deck = makeDeck()
    for (let i = 0; i < 10_000; i++) {
      const hand = shuffle(deck, rng).slice(0, 7)
      const fast = evaluate7(hand)
      const slow = referenceEvaluate7(hand)
      if (fast !== slow) {
        // Include the hand in the failure message so a regression is instantly
        // reproducible rather than just 'expected 5439488 to be 5308416'.
        expect.fail(
          `hand ${hand.map((c) => `${'23456789TJQKA'[rankOf(c)]}${'cdhs'[suitOf(c)]}`).join(' ')}` +
            `: fast=${describeScore(fast)} (${fast}) slow=${describeScore(slow)} (${slow})`,
        )
      }
    }
  })
})
