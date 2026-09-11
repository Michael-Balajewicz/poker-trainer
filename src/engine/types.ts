// The shape of a hand of No-Limit Texas Hold'em.
//
// TWO CONVENTIONS THAT PREVENT MOST POKER-ENGINE BUGS:
//
// 1. Bet amounts are always raise-TO, never raise-BY. `{ type: 'raise', to: 300 }`
//    means "my total commitment this street becomes 300", not "add 300". Pick one
//    and never deviate; mixing them is the single most common source of bugs here.
//
// 2. Chips are integers everywhere. Never let a float into the money path --
//    round at the UI boundary before building an Action.
//
// GameState must also stay JSON-serializable: no Map, Set, class, function or
// Date. That is what makes hand history, a future Web Worker, and a future
// server all free.

import type { Card } from './cards.ts'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

/**
 * - active: can still make decisions
 * - folded: out of this hand
 * - allin:  in the hand, but has no chips left to act with
 * - out:    busted, not dealt into this hand at all
 */
export type SeatStatus = 'active' | 'folded' | 'allin' | 'out'

export type Seat = {
  id: number
  name: string
  isHuman: boolean
  stack: number
  /** Chips put in on the current street. Reset to 0 each street. */
  committedThisStreet: number
  /** Chips put in across the whole hand. The only input side pots need. */
  committedThisHand: number
  holeCards: [Card, Card] | null
  status: SeatStatus
  /**
   * Has acted since the last FULL raise.
   *
   * This one flag carries the min-raise rules. A seat may raise if and only if
   * hasActed is false: a full raise resets every other active seat to false
   * (reopening betting), while an all-in raise for less than a full raise does
   * not (so players who already acted may only fold or call).
   *
   * Posting a blind deliberately does NOT set this, which is what gives the big
   * blind its option to raise when everyone limps.
   */
  hasActed: boolean
}

/**
 * A decision a player can make. There is deliberately no 'allin' variant --
 * all-in is a bet/raise/call whose amount happens to equal the stack, and a
 * separate variant would duplicate every sizing rule.
 */
export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }

/**
 * What a player may legally do right now.
 *
 * Note that bet/raise carry a RANGE, not a list of amounts -- correct for a
 * slider UI. The coach therefore cannot just iterate these; it builds its own
 * discrete list of candidate sizes.
 */
export type LegalAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number } // chips needed; less than betToCall if short
  | { type: 'bet'; min: number; max: number } // bounds on `to`
  | { type: 'raise'; min: number; max: number }

/** One layer of the pot. With unequal all-ins there are several. */
export type Pot = {
  amount: number
  /** Seat ids that can win this layer. */
  eligible: number[]
}

export type ShowdownEntry = {
  seat: number
  score: number
  description: string
}

export type HandResult = {
  pots: Pot[]
  /** Chips won, indexed by seat id. */
  payouts: number[]
  /** null when everyone folded -- no cards are revealed in that case. */
  showdown: ShowdownEntry[] | null
}

/**
 * A structured record of everything that happened, in order.
 *
 * This drives the hand-history panel now, and is exactly the payload a server
 * would persist later -- which is why it is plain data rather than strings.
 */
export type LogEntry =
  | { type: 'hand-start'; handNumber: number; button: number }
  | { type: 'blind'; seat: number; amount: number; blind: 'small' | 'big' }
  | { type: 'action'; seat: number; action: Action; amount: number; allIn: boolean }
  | { type: 'deal'; street: Street; cards: Card[] }
  | { type: 'showdown'; seat: number; description: string }
  | { type: 'award'; seat: number; amount: number; potIndex: number }
  | { type: 'fold-win'; seat: number; amount: number }

export type GameState = {
  seats: Seat[]
  buttonIndex: number
  street: Street
  board: Card[]
  /** Shuffled at hand start; dealt from by deckIndex. */
  deck: Card[]
  deckIndex: number
  /** null means nobody has a decision to make (hand over, or mid-cascade). */
  currentTurn: number | null
  /** The highest committedThisStreet anyone has reached this street. */
  betToCall: number
  /** Size of the last FULL raise increment. Resets to the big blind each street. */
  lastRaiseSize: number
  smallBlind: number
  bigBlind: number
  handNumber: number
  /** Seed this hand was dealt from, so the whole hand is reproducible. */
  rngState: number
  log: LogEntry[]
  /** Non-null means the hand is over. */
  result: HandResult | null
}

export type TableConfig = {
  seatCount: number
  startingStack: number
  smallBlind: number
  bigBlind: number
  /** Which seat the human sits in; every other seat is a bot. */
  humanSeat: number
  seed: number
  names: string[]
}
