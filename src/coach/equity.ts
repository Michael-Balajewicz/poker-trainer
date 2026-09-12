// Monte Carlo equity.
//
// "What fraction of the time does this hand win?" answered by dealing the rest
// of the board and the opponents' cards at random, many times, and counting.
//
// Two things matter for speed, because this runs on a button press and has to
// feel instant:
//   1. One deck array, reused across every trial. Allocating a fresh deck per
//      trial is what makes naive implementations ten times slower.
//   2. One seven-card scratch array. The board occupies slots 2..6 for a whole
//      trial, so scoring each player only rewrites the first two slots.

import type { Card } from '../engine/cards.ts'
import { DECK_SIZE } from '../engine/cards.ts'
import { evaluate7 } from '../engine/evaluate.ts'

export type EquityResult = {
  /** 0..1, counting ties as a fractional win. */
  equity: number
  win: number
  tie: number
  lose: number
  iterations: number
}

export function simulateEquity(args: {
  hero: readonly [Card, Card]
  board: readonly Card[]
  opponents: number
  iterations: number
  rng: () => number
}): EquityResult {
  const { hero, board, opponents, iterations, rng } = args

  // Everything not already visible to us is still live.
  const seen = new Set<Card>([hero[0], hero[1], ...board])
  const deck: Card[] = []
  for (let card = 0; card < DECK_SIZE; card++) if (!seen.has(card)) deck.push(card)

  const boardNeeded = 5 - board.length
  const draws = opponents * 2 + boardNeeded
  if (opponents < 1 || draws > deck.length) {
    return { equity: 1, win: iterations, tie: 0, lose: 0, iterations }
  }

  const hand: Card[] = new Array(7)
  const fullBoard: Card[] = new Array(5)
  for (let i = 0; i < board.length; i++) fullBoard[i] = board[i]

  let win = 0
  let tie = 0
  let lose = 0
  let total = 0

  for (let trial = 0; trial < iterations; trial++) {
    // Partial Fisher-Yates: only shuffle as many cards as this trial consumes.
    for (let i = 0; i < draws; i++) {
      const j = i + Math.floor(rng() * (deck.length - i))
      const swap = deck[i]
      deck[i] = deck[j]
      deck[j] = swap
    }

    let next = 0
    for (let i = board.length; i < 5; i++) fullBoard[i] = deck[next++]
    for (let i = 0; i < 5; i++) hand[i + 2] = fullBoard[i]

    hand[0] = hero[0]
    hand[1] = hero[1]
    const heroScore = evaluate7(hand)

    let beaten = false
    let tied = 0
    for (let opponent = 0; opponent < opponents; opponent++) {
      hand[0] = deck[next++]
      hand[1] = deck[next++]
      const score = evaluate7(hand)
      if (score > heroScore) {
        beaten = true
        break
      }
      if (score === heroScore) tied++
    }

    if (beaten) {
      lose++
    } else if (tied > 0) {
      tie++
      // A three-way tie is worth a third of the pot, and so on.
      total += 1 / (tied + 1)
    } else {
      win++
      total += 1
    }
  }

  return { equity: total / iterations, win, tie, lose, iterations }
}

/**
 * A stable seed for one decision.
 *
 * Without this, asking the coach twice about the same spot would run two
 * different simulations and give two different verdicts -- which destroys trust
 * in the tool faster than being slightly wrong would.
 */
export function seedForSpot(values: readonly number[]): number {
  let hash = 2166136261
  for (const value of values) {
    hash ^= value | 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
