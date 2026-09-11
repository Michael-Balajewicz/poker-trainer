import { describe, expect, it } from 'vitest'
import {
  DECK_SIZE,
  formatCard,
  formatCards,
  makeCard,
  makeDeck,
  parseCard,
  parseCards,
  rankOf,
  suitOf,
} from './cards.ts'
import { mulberry32, nextSeed, shuffle } from './rng.ts'

describe('card encoding', () => {
  it('builds a deck of 52 distinct cards', () => {
    const deck = makeDeck()
    expect(deck).toHaveLength(DECK_SIZE)
    expect(new Set(deck).size).toBe(DECK_SIZE)
  })

  it('round-trips rank and suit for every card in the deck', () => {
    for (const card of makeDeck()) {
      expect(makeCard(rankOf(card), suitOf(card))).toBe(card)
    }
  })

  it('round-trips through text for every card in the deck', () => {
    for (const card of makeDeck()) {
      expect(parseCard(formatCard(card))).toBe(card)
    }
  })

  it('formats the corners of the deck correctly', () => {
    expect(formatCard(0)).toBe('2c')
    expect(formatCard(DECK_SIZE - 1)).toBe('As')
  })

  it('parses spaced and compact card lists identically', () => {
    expect(parseCards('As Kd 7h')).toEqual(parseCards('AsKd7h'))
    expect(formatCards(parseCards('As Kd 7h'))).toBe('As Kd 7h')
  })

  it('rejects malformed input', () => {
    expect(() => parseCard('Xx')).toThrow()
    expect(() => parseCards('AsK')).toThrow()
  })
})

describe('seeded shuffling', () => {
  it('gives the same order twice for the same seed', () => {
    const a = shuffle(makeDeck(), mulberry32(12345))
    const b = shuffle(makeDeck(), mulberry32(12345))
    expect(a).toEqual(b)
  })

  it('gives a different order for a different seed', () => {
    const a = shuffle(makeDeck(), mulberry32(1))
    const b = shuffle(makeDeck(), mulberry32(2))
    expect(a).not.toEqual(b)
  })

  it('keeps all 52 cards and loses none', () => {
    const shuffled = shuffle(makeDeck(), mulberry32(99))
    expect(new Set(shuffled).size).toBe(DECK_SIZE)
    expect([...shuffled].sort((x, y) => x - y)).toEqual(makeDeck())
  })

  it('does not mutate the array it was given', () => {
    const deck = makeDeck()
    shuffle(deck, mulberry32(7))
    expect(deck).toEqual(makeDeck())
  })

  it('steps the seed forward deterministically', () => {
    expect(nextSeed(42)).toBe(nextSeed(42))
    expect(nextSeed(42)).not.toBe(42)
    // Must stay a valid unsigned 32-bit int, or mulberry32 misbehaves.
    expect(nextSeed(0xffffffff)).toBeGreaterThanOrEqual(0)
    expect(nextSeed(0xffffffff)).toBeLessThan(0x100000000)
  })

  it('produces floats in [0, 1)', () => {
    const rng = mulberry32(2024)
    for (let i = 0; i < 1000; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
