// The No-Limit Hold'em state machine.
//
// Two public operations drive everything:
//
//   legalActions(state) -> what the player to act may do right now
//   applyAction(state, action) -> the next state
//
// applyAction is a pure function from state to state, which is not a
// coincidence: that is exactly React's reducer signature, so the UI can hand
// this straight to useReducer.
//
// It also cascades. After applying the action it keeps going -- closing the
// betting round, dealing the next street, running out an all-in board, settling
// the pots -- until either a real decision is required or the hand is over.
// Without that, React would end up driving the state machine and the engine's
// invariants would leak into the components.

import type { Card } from './cards.ts'
import { makeDeck } from './cards.ts'
import { describeScore, evaluate7 } from './evaluate.ts'
import { buildPots, splitPot } from './pots.ts'
import { mulberry32, nextSeed, shuffle } from './rng.ts'
import type {
  BettingState,
  Action,
  GameState,
  LegalAction,
  Seat,
  SeatStatus,
  ShowdownEntry,
  Street,
  TableConfig,
} from './types.ts'

/** Still in the hand -- either able to act, or all-in and along for the ride. */
const isContender = (seat: Seat): boolean => seat.status === 'active' || seat.status === 'allin'

// ---------------------------------------------------------------------------
// Starting hands
// ---------------------------------------------------------------------------

export function startTable(config: TableConfig): GameState {
  const seats: Seat[] = []
  for (let i = 0; i < config.seatCount; i++) {
    seats.push({
      id: i,
      name: config.names[i] ?? `Seat ${i + 1}`,
      isHuman: i === config.humanSeat,
      stack: config.startingStack,
      committedThisStreet: 0,
      committedThisHand: 0,
      holeCards: null,
      status: 'active',
      hasActed: false,
    })
  }
  return dealHand(seats, 0, 1, config.seed, config.smallBlind, config.bigBlind)
}

export function nextHand(previous: GameState): GameState {
  // Statuses are recomputed from stacks first, so the button correctly skips
  // anyone who busted on the previous hand.
  const seats = previous.seats.map((seat) => ({
    ...seat,
    status: (seat.stack > 0 ? 'active' : 'out') as SeatStatus,
  }))
  const button = nextOccupied(seats, previous.buttonIndex)
  return dealHand(
    seats,
    button,
    previous.handNumber + 1,
    nextSeed(previous.rngState),
    previous.smallBlind,
    previous.bigBlind,
  )
}

function dealHand(
  input: readonly Seat[],
  buttonIndex: number,
  handNumber: number,
  seed: number,
  smallBlind: number,
  bigBlind: number,
): GameState {
  const seats: Seat[] = input.map((seat) => ({
    ...seat,
    committedThisStreet: 0,
    committedThisHand: 0,
    holeCards: null,
    hasActed: false,
    status: seat.stack > 0 ? 'active' : 'out',
  }))

  const state: GameState = {
    seats,
    buttonIndex,
    street: 'preflop',
    board: [],
    deck: shuffle(makeDeck(), mulberry32(seed)),
    deckIndex: 0,
    currentTurn: null,
    betToCall: 0,
    lastRaiseSize: bigBlind,
    smallBlind,
    bigBlind,
    handNumber,
    rngState: seed,
    log: [{ type: 'hand-start', handNumber, button: buttonIndex }],
    result: null,
  }

  for (const seat of seats) {
    if (seat.status === 'active') seat.holeCards = [draw(state), draw(state)]
  }

  // Heads-up is the one special case in the whole seating model, and it costs
  // exactly this ternary: the button posts the small blind. Everything else --
  // "button acts first preflop, last postflop" -- then falls out of the normal
  // clockwise scan for free.
  const playing = seats.filter((seat) => seat.status === 'active').length
  const sbIndex = playing === 2 ? buttonIndex : nextOccupied(seats, buttonIndex)
  const bbIndex = nextOccupied(seats, sbIndex)

  postBlind(state, sbIndex, smallBlind, 'small')
  postBlind(state, bbIndex, bigBlind, 'big')

  // The betting level is the big blind even if the player in that seat was too
  // short to post it in full.
  state.betToCall = bigBlind
  state.lastRaiseSize = bigBlind

  // First to act preflop is left of the big blind. Pointing currentTurn at the
  // big blind makes the normal clockwise scan start in the right place.
  state.currentTurn = bbIndex
  advance(state)
  return state
}

function postBlind(
  state: GameState,
  seatIndex: number,
  blind: number,
  which: 'small' | 'big',
): void {
  const seat = state.seats[seatIndex]
  const amount = Math.min(blind, seat.stack)
  commit(seat, amount)
  state.log.push({ type: 'blind', seat: seatIndex, amount, blind: which })
  // Deliberately does NOT set hasActed. That single omission is what gives the
  // big blind its option to raise when everyone limps.
}

function draw(state: GameState): Card {
  const card = state.deck[state.deckIndex]
  state.deckIndex += 1
  return card
}

function commit(seat: Seat, amount: number): void {
  seat.stack -= amount
  seat.committedThisStreet += amount
  seat.committedThisHand += amount
  if (seat.stack === 0) seat.status = 'allin'
}

/** Next seat clockwise that is dealt into this hand (skips busted seats). */
function nextOccupied(seats: readonly Seat[], from: number): number {
  const count = seats.length
  for (let i = 1; i <= count; i++) {
    const index = (from + i) % count
    if (seats[index].status !== 'out') return index
  }
  return from
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function legalActions(state: BettingState): LegalAction[] {
  const turn = state.currentTurn
  if (turn === null || state.result !== null) return []

  const seat = state.seats[turn]
  const toCall = state.betToCall - seat.committedThisStreet
  const options: LegalAction[] = []

  if (toCall > 0) {
    options.push({ type: 'fold' })
    // Capped at the stack: a short stack calls all-in for less.
    options.push({ type: 'call', amount: Math.min(toCall, seat.stack) })
  } else {
    // Folding when checking is free is legal in real poker but never correct,
    // and offering the button is purely a way to misclick away a free card.
    options.push({ type: 'check' })
  }

  const maxTo = seat.committedThisStreet + seat.stack

  // A seat may put in more chips if and only if it has not acted since the last
  // full raise. That single condition encodes the whole min-raise rule set --
  // including the case where an all-in for less than a full raise does not
  // reopen betting for players who already acted.
  if (!seat.hasActed && maxTo > state.betToCall) {
    if (state.betToCall === 0) {
      options.push({ type: 'bet', min: Math.min(state.bigBlind, maxTo), max: maxTo })
    } else {
      // Short all-in raises are still allowed, so the minimum collapses to the
      // stack when the stack cannot cover a full raise.
      const min = Math.min(state.betToCall + state.lastRaiseSize, maxTo)
      options.push({ type: 'raise', min, max: maxTo })
    }
  }

  return options
}

function assertLegal(legal: readonly LegalAction[], action: Action): void {
  if (action.type === 'bet' || action.type === 'raise') {
    const option = legal.find((entry) => entry.type === action.type)
    if (option === undefined || (option.type !== 'bet' && option.type !== 'raise')) {
      throw new Error(
        `Illegal ${action.type}: legal actions are ${describeLegal(legal)}`,
      )
    }
    if (!Number.isInteger(action.to)) {
      throw new Error(`Bet amounts must be whole chips, got ${action.to}`)
    }
    if (action.to < option.min || action.to > option.max) {
      throw new Error(
        `Illegal ${action.type} to ${action.to}: must be between ${option.min} and ${option.max}`,
      )
    }
    return
  }
  if (!legal.some((entry) => entry.type === action.type)) {
    throw new Error(`Illegal ${action.type}: legal actions are ${describeLegal(legal)}`)
  }
}

const describeLegal = (legal: readonly LegalAction[]): string =>
  legal.length === 0 ? 'none' : legal.map((entry) => entry.type).join(', ')

// ---------------------------------------------------------------------------
// Applying an action
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): GameState {
  if (state.result !== null) throw new Error('The hand is already complete')
  const turn = state.currentTurn
  if (turn === null) throw new Error('There is no player to act')

  assertLegal(legalActions(state), action)

  // structuredClone keeps applyAction pure without hand-rolling a deep copy.
  // It works precisely because GameState is plain JSON -- no Map, no class, no
  // function anywhere in it.
  const next: GameState = structuredClone(state)
  const seat = next.seats[turn]

  switch (action.type) {
    case 'fold': {
      seat.status = 'folded'
      seat.hasActed = true
      next.log.push({ type: 'action', seat: turn, action, amount: 0, allIn: false })
      break
    }
    case 'check': {
      seat.hasActed = true
      next.log.push({ type: 'action', seat: turn, action, amount: 0, allIn: false })
      break
    }
    case 'call': {
      const amount = Math.min(next.betToCall - seat.committedThisStreet, seat.stack)
      commit(seat, amount)
      seat.hasActed = true
      next.log.push({
        type: 'action',
        seat: turn,
        action,
        amount,
        allIn: seat.status === 'allin',
      })
      break
    }
    case 'bet':
    case 'raise': {
      const amount = action.to - seat.committedThisStreet
      const increment = action.to - next.betToCall
      commit(seat, amount)

      if (increment >= next.lastRaiseSize) {
        // A full raise. Everyone else gets their decision back.
        next.lastRaiseSize = increment
        next.betToCall = action.to
        for (const other of next.seats) {
          if (other.id !== turn && other.status === 'active') other.hasActed = false
        }
      } else {
        // An all-in for less than a full raise. The amount to call goes up, but
        // betting is NOT reopened: players who already acted may only fold or
        // call, and lastRaiseSize is left alone so anyone still to act raises
        // off the previous full raise.
        next.betToCall = action.to
      }

      seat.hasActed = true
      next.log.push({
        type: 'action',
        seat: turn,
        action,
        amount,
        allIn: seat.status === 'allin',
      })
      break
    }
  }

  advance(next)
  return next
}

/**
 * Move the hand forward until someone has a real decision to make, or it ends.
 */
function advance(state: GameState): void {
  for (;;) {
    // Everyone folded to one player: the hand stops immediately. No further
    // cards are dealt and nobody's hole cards are revealed.
    if (state.seats.filter(isContender).length <= 1) {
      settle(state)
      return
    }

    if (!bettingRoundClosed(state)) {
      state.currentTurn = nextActor(state)
      return
    }

    if (state.street === 'river') {
      settle(state)
      return
    }

    dealNextStreet(state)
    // Loop again: with players all-in the new street is immediately closed too,
    // which is what runs the board out to showdown.
  }
}

function bettingRoundClosed(state: GameState): boolean {
  const actors = state.seats.filter((seat) => seat.status === 'active')
  if (actors.length === 0) return true

  if (actors.length === 1) {
    // One player still has chips, everyone else is all-in. There is nobody left
    // to call a bet, so the only thing that can still be owed is a call -- and
    // if nothing is owed, betting is over even though they never "acted".
    return actors[0].committedThisStreet === state.betToCall
  }

  return actors.every(
    (seat) => seat.hasActed && seat.committedThisStreet === state.betToCall,
  )
}

function nextActor(state: GameState): number {
  const count = state.seats.length
  // Falling back to the button means a fresh street starts the scan at the seat
  // left of the button, which is exactly first-to-act postflop.
  const from = state.currentTurn ?? state.buttonIndex
  for (let i = 1; i <= count; i++) {
    const index = (from + i) % count
    const seat = state.seats[index]
    if (seat.status !== 'active') continue
    if (!seat.hasActed || seat.committedThisStreet < state.betToCall) return index
  }
  throw new Error('Betting round is open but no seat needs to act')
}

function dealNextStreet(state: GameState): void {
  for (const seat of state.seats) {
    seat.committedThisStreet = 0
    seat.hasActed = false
  }
  state.betToCall = 0
  // Must reset, or postflop minimum raises would inherit preflop sizing.
  state.lastRaiseSize = state.bigBlind
  state.currentTurn = null

  const street: Street =
    state.street === 'preflop' ? 'flop' : state.street === 'flop' ? 'turn' : 'river'
  const cards: Card[] = []
  for (let i = 0; i < (street === 'flop' ? 3 : 1); i++) cards.push(draw(state))

  state.board.push(...cards)
  state.street = street
  state.log.push({ type: 'deal', street, cards })
}

function settle(state: GameState): void {
  const pots = buildPots(state.seats)
  const contenders = state.seats.filter(isContender)
  const payouts = state.seats.map(() => 0)
  state.currentTurn = null

  if (contenders.length === 1) {
    const winner = contenders[0]
    const total = pots.reduce((sum, pot) => sum + pot.amount, 0)
    winner.stack += total
    payouts[winner.id] = total
    state.log.push({ type: 'fold-win', seat: winner.id, amount: total })
    state.result = { pots, payouts, showdown: null }
    return
  }

  // Showdown. The board is always complete by now because advance() deals out
  // the remaining streets before getting here.
  const scores = state.seats.map(() => -1)
  const showdown: ShowdownEntry[] = []
  for (const seat of contenders) {
    if (seat.holeCards === null) continue
    const score = evaluate7([...seat.holeCards, ...state.board])
    scores[seat.id] = score
    const description = describeScore(score)
    showdown.push({ seat: seat.id, score, description })
    state.log.push({ type: 'showdown', seat: seat.id, description })
  }

  pots.forEach((pot, potIndex) => {
    let best = -1
    for (const id of pot.eligible) if (scores[id] > best) best = scores[id]
    const winners = pot.eligible.filter((id) => scores[id] === best)
    for (const award of splitPot(pot.amount, winners, state.seats.length, state.buttonIndex)) {
      state.seats[award.seat].stack += award.amount
      payouts[award.seat] += award.amount
      state.log.push({ type: 'award', seat: award.seat, amount: award.amount, potIndex })
    }
  })

  state.result = { pots, payouts, showdown }
}

// ---------------------------------------------------------------------------
// Small helpers the UI and bots need
// ---------------------------------------------------------------------------

/** Every chip in the middle, including the current street's bets. */
export const potSize = (state: BettingState): number =>
  state.seats.reduce((sum, seat) => sum + seat.committedThisHand, 0)

/** What the seat to act must put in to call. */
export function amountToCall(state: BettingState, seatId: number): number {
  const seat = state.seats[seatId]
  return Math.max(0, Math.min(state.betToCall - seat.committedThisStreet, seat.stack))
}
