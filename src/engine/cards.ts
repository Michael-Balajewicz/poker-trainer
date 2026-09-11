// Card encoding.
//
// A card is a single integer 0..51, packed as `rank * 4 + suit`:
//   rank 0..12 = 2,3,4,5,6,7,8,9,T,J,Q,K,A
//   suit 0..3  = clubs, diamonds, hearts, spades
//
// Integers rather than { rank, suit } objects because the hand evaluator and
// the coach's Monte Carlo run millions of these, and allocating an object per
// card is what makes naive poker code slow. formatCard keeps them readable.

export type Card = number

export const RANKS = '23456789TJQKA'
export const SUITS = 'cdhs'

export const DECK_SIZE = 52

// rank * 4 means the rank occupies the high bits and the suit the low 2 bits,
// so these are just a shift and a mask.
export const rankOf = (card: Card): number => card >> 2
export const suitOf = (card: Card): number => card & 3

export const makeCard = (rank: number, suit: number): Card => rank * 4 + suit

/** 'As', '7h' — the standard way poker hands are written down. */
export const formatCard = (card: Card): string => RANKS[rankOf(card)] + SUITS[suitOf(card)]

export const formatCards = (cards: readonly Card[]): string => cards.map(formatCard).join(' ')

/** An ordered deck, 0..51. Shuffle it with shuffle() from rng.ts. */
export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (let i = 0; i < DECK_SIZE; i++) deck.push(i)
  return deck
}

/** Parse a single card, e.g. 'As'. Throws on anything malformed. */
export function parseCard(text: string): Card {
  const rank = RANKS.indexOf(text[0].toUpperCase())
  const suit = SUITS.indexOf(text[1].toLowerCase())
  if (rank < 0 || suit < 0) throw new Error(`Bad card: ${text}`)
  return makeCard(rank, suit)
}

/**
 * Parse several cards: 'As Kd 7h' or 'AsKd7h' both work.
 * This exists so tests and debugging can read like actual poker.
 */
export function parseCards(text: string): Card[] {
  const compact = text.replace(/\s+/g, '')
  if (compact.length % 2 !== 0) throw new Error(`Bad card list: ${text}`)
  const cards: Card[] = []
  for (let i = 0; i < compact.length; i += 2) cards.push(parseCard(compact.slice(i, i + 2)))
  return cards
}
