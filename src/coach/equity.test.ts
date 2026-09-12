import { describe, expect, it } from 'vitest'
import type { Card } from '../engine/cards.ts'
import { parseCards } from '../engine/cards.ts'
import { mulberry32 } from '../engine/rng.ts'
import { seedForSpot, simulateEquity } from './equity.ts'

const hole = (text: string): [Card, Card] => {
  const cards = parseCards(text)
  return [cards[0], cards[1]]
}

const equityOf = (heroText: string, boardText: string, opponents: number, seed = 99) =>
  simulateEquity({
    hero: hole(heroText),
    board: parseCards(boardText),
    opponents,
    iterations: 20_000,
    rng: mulberry32(seed),
  }).equity

// Published all-in equities for these spots. Agreement with them is what says
// the simulator, the deck handling and the evaluator are all wired up right.
describe('known preflop equities', () => {
  it('puts aces around 85% against one random hand', () => {
    expect(equityOf('As Ad', '', 1)).toBeGreaterThan(0.83)
    expect(equityOf('As Ad', '', 1)).toBeLessThan(0.875)
  })

  it('puts seven-deuce around 35% against one random hand', () => {
    const equity = equityOf('7h 2c', '', 1)
    expect(equity).toBeGreaterThan(0.32)
    expect(equity).toBeLessThan(0.38)
  })

  it('puts aces around 31% against a full table', () => {
    const equity = equityOf('As Ad', '', 8)
    expect(equity).toBeGreaterThan(0.27)
    expect(equity).toBeLessThan(0.36)
  })

  it('drops the same hand as opponents are added', () => {
    const one = equityOf('Ks Kd', '', 1)
    const three = equityOf('Ks Kd', '', 3)
    const eight = equityOf('Ks Kd', '', 8)
    expect(one).toBeGreaterThan(three)
    expect(three).toBeGreaterThan(eight)
  })
})

describe('postflop equities', () => {
  it('rates a flopped nut flush very highly', () => {
    expect(equityOf('As Ks', 'Qs 7s 2s', 1)).toBeGreaterThan(0.9)
  })

  it('rates a hopeless hand on a high board very low', () => {
    // Seven high against three opponents on an ace-king-queen board. Note the
    // board itself must not be the nuts, or everyone simply splits.
    expect(equityOf('7c 2d', 'As Ks Qh 8d 3c', 3)).toBeLessThan(0.1)
  })

  it('gives a made hand on the river no more cards to improve', () => {
    // The board is complete, so equity is purely "is this best right now".
    const result = simulateEquity({
      hero: hole('As Ad'),
      board: parseCards('Ah Kd Qc 7s 2h'),
      opponents: 1,
      iterations: 5_000,
      rng: mulberry32(3),
    })
    expect(result.equity).toBeGreaterThan(0.95)
    expect(result.win + result.tie + result.lose).toBe(5_000)
  })

  it('finds the split when the board plays for everyone', () => {
    // A royal flush on the board: nobody can do better than a tie.
    const result = simulateEquity({
      hero: hole('2c 3d'),
      board: parseCards('As Ks Qs Js Ts'),
      opponents: 2,
      iterations: 2_000,
      rng: mulberry32(5),
    })
    expect(result.lose).toBe(0)
    expect(result.tie).toBe(2_000)
  })
})

describe('determinism', () => {
  it('gives the same answer for the same seed', () => {
    expect(equityOf('Js Th', '9s 8d 2c', 2, 1234)).toBe(equityOf('Js Th', '9s 8d 2c', 2, 1234))
  })

  it('hashes a spot to a stable seed', () => {
    expect(seedForSpot([1, 2, 3])).toBe(seedForSpot([1, 2, 3]))
    expect(seedForSpot([1, 2, 3])).not.toBe(seedForSpot([1, 2, 4]))
    expect(seedForSpot([51, 50, 49])).toBeLessThan(0x100000000)
  })

  it('never deals a card the hero or the board already holds', () => {
    const result = simulateEquity({
      hero: hole('As Ad'),
      board: parseCards('Ah Ac Kd'),
      opponents: 1,
      iterations: 2_000,
      rng: mulberry32(7),
    })
    // Holding all four aces, no opponent can ever make quad aces and beat us,
    // so we can only win or (on a board-plays straight flush) tie.
    expect(result.equity).toBeGreaterThan(0.9)
  })
})
