import { describe, expect, it } from 'vitest'
import { applyAction, legalActions, nextHand, potSize, startTable } from './hand.ts'
import { mulberry32 } from './rng.ts'
import type { Action, GameState, LegalAction, TableConfig } from './types.ts'

function table(overrides: Partial<TableConfig> = {}): GameState {
  return startTable({
    seatCount: 9,
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
    humanSeat: 0,
    seed: 1,
    names: [],
    ...overrides,
  })
}

const types = (state: GameState): string[] =>
  legalActions(state)
    .map((option) => option.type)
    .sort()

function raiseBounds(state: GameState): { min: number; max: number } | null {
  const option = legalActions(state).find((o) => o.type === 'bet' || o.type === 'raise')
  if (option === undefined || (option.type !== 'bet' && option.type !== 'raise')) return null
  return { min: option.min, max: option.max }
}

describe('dealing and seating', () => {
  it('posts blinds and starts the action left of the big blind', () => {
    const state = table()
    expect(state.buttonIndex).toBe(0)
    expect(state.seats[1].committedThisStreet).toBe(10) // small blind
    expect(state.seats[2].committedThisStreet).toBe(20) // big blind
    expect(state.currentTurn).toBe(3) // under the gun
    expect(state.betToCall).toBe(20)
  })

  it('deals two cards to every seat and none to nobody', () => {
    const state = table()
    for (const seat of state.seats) expect(seat.holeCards).toHaveLength(2)
    const all = state.seats.flatMap((seat) => seat.holeCards ?? [])
    expect(new Set(all).size).toBe(18)
  })

  it('heads-up: the button posts the small blind and acts first preflop', () => {
    const state = table({ seatCount: 2 })
    expect(state.seats[0].committedThisStreet).toBe(10)
    expect(state.seats[1].committedThisStreet).toBe(20)
    expect(state.currentTurn).toBe(0)
  })

  it('heads-up: the button acts last postflop', () => {
    let state = table({ seatCount: 2 })
    state = applyAction(state, { type: 'call' }) // button completes
    state = applyAction(state, { type: 'check' }) // big blind checks
    expect(state.street).toBe('flop')
    expect(state.currentTurn).toBe(1) // big blind is first postflop
  })

  it('moves the button clockwise and skips busted seats', () => {
    let state = table({ seatCount: 4 })
    state = structuredClone(state)
    state.seats[1].stack = 0 // seat 1 busts
    state.result = { pots: [], payouts: [0, 0, 0, 0], showdown: null }

    const dealt = nextHand(state)
    expect(dealt.seats[1].status).toBe('out')
    expect(dealt.buttonIndex).toBe(2) // skipped past the empty seat 1
    expect(dealt.seats[1].holeCards).toBeNull()
  })
})

describe('betting round rules', () => {
  it('gives the big blind its option when everyone limps', () => {
    let state = table()
    while (state.currentTurn !== 1) state = applyAction(state, { type: 'fold' })
    state = applyAction(state, { type: 'call' }) // small blind completes
    expect(state.currentTurn).toBe(2) // big blind, despite having "paid"
    expect(types(state)).toContain('check')
    expect(types(state)).toContain('raise')
  })

  it('closes the round when the big blind checks its option', () => {
    let state = table()
    // Everyone limps. They cannot fold here: folding the table down to the big
    // blind would end the hand outright instead of reaching its option.
    while (state.currentTurn !== 2) state = applyAction(state, { type: 'call' })
    state = applyAction(state, { type: 'check' })
    expect(state.street).toBe('flop')
    expect(state.board).toHaveLength(3)
  })

  it('rejects a raise below the minimum', () => {
    const state = table()
    expect(() => applyAction(state, { type: 'raise', to: 30 })).toThrow(/between 40/)
    expect(() => applyAction(state, { type: 'raise', to: 40 })).not.toThrow()
  })

  it('rejects fractional chip amounts', () => {
    const state = table()
    expect(() => applyAction(state, { type: 'raise', to: 40.5 })).toThrow(/whole chips/)
  })

  it('does not offer a fold when checking is free', () => {
    let state = table()
    while (state.currentTurn !== 2) state = applyAction(state, { type: 'call' })
    expect(types(state)).not.toContain('fold')
  })

  it('resets the minimum raise size on each new street', () => {
    let state = table()
    state = applyAction(state, { type: 'raise', to: 200 }) // big preflop raise
    while (state.street === 'preflop') {
      state = applyAction(state, types(state).includes('call') ? { type: 'call' } : { type: 'fold' })
    }
    expect(state.street).toBe('flop')
    // A minimum bet postflop is one big blind, not the preflop raise size.
    expect(raiseBounds(state)?.min).toBe(20)
  })

  it('reopens betting for everyone after a full raise', () => {
    let state = table({ seatCount: 4 })
    state = applyAction(state, { type: 'raise', to: 60 }) // seat 3
    state = applyAction(state, { type: 'call' }) // seat 0 calls
    state = applyAction(state, { type: 'raise', to: 200 }) // seat 1 re-raises
    state = applyAction(state, { type: 'fold' }) // seat 2
    // Seat 3 acted long ago, but the full raise handed the decision back.
    expect(state.currentTurn).toBe(3)
    expect(types(state)).toContain('raise')
  })
})

describe('all-in for less than a full raise', () => {
  // The rule most hobby engines get wrong: the amount to call goes up, but
  // players who already acted do not get to raise again.
  function shortAllInSetup(): GameState {
    let state = table({ seatCount: 4 })
    state = structuredClone(state)
    state.seats[1].stack = 130 // already posted 10, so it can reach exactly 140

    state = applyAction(state, { type: 'raise', to: 100 }) // seat 3, a full +80 raise
    state = applyAction(state, { type: 'call' }) // seat 0 calls 100
    return applyAction(state, { type: 'raise', to: 140 }) // seat 1 all-in, only +40
  }

  it('raises the amount to call but leaves the raise size alone', () => {
    const state = shortAllInSetup()
    expect(state.seats[1].status).toBe('allin')
    expect(state.betToCall).toBe(140)
    expect(state.lastRaiseSize).toBe(80) // still the previous full raise
  })

  it('still lets a player who had not yet acted raise, off the last full raise', () => {
    const state = shortAllInSetup()
    expect(state.currentTurn).toBe(2) // the big blind has not acted yet
    expect(raiseBounds(state)?.min).toBe(220) // 140 to call + the 80 raise
  })

  it('does not reopen betting for players who already acted', () => {
    let state = shortAllInSetup()
    state = applyAction(state, { type: 'call' }) // seat 2 calls 140
    expect(state.currentTurn).toBe(3) // the original raiser owes 40 more
    expect(types(state)).toEqual(['call', 'fold']) // no raise available
    state = applyAction(state, { type: 'call' })
    expect(state.currentTurn).toBe(0) // the caller also only has fold/call
    expect(types(state)).toEqual(['call', 'fold'])
  })
})

describe('ending a hand', () => {
  it('stops the moment everyone folds, revealing nothing', () => {
    let state = table()
    while (state.result === null) state = applyAction(state, { type: 'fold' })
    expect(state.result.showdown).toBeNull()
    expect(state.board).toHaveLength(0) // no cards dealt after it was over
    expect(state.street).toBe('preflop')
    expect(state.result.payouts[2]).toBe(30) // big blind takes the blinds
    expect(state.seats[2].stack).toBe(2000 - 20 + 30)
  })

  it('runs the board out exactly once when everyone is all-in', () => {
    let state = table({ seatCount: 2 })
    state = applyAction(state, { type: 'raise', to: 2000 }) // button shoves
    state = applyAction(state, { type: 'call' }) // big blind calls

    expect(state.result).not.toBeNull()
    expect(state.board).toHaveLength(5)
    const deals = state.log.filter((entry) => entry.type === 'deal')
    expect(deals.map((entry) => (entry.type === 'deal' ? entry.street : ''))).toEqual([
      'flop',
      'turn',
      'river',
    ])
  })

  it('awards the whole pot to a single winner at showdown', () => {
    let state = table({ seatCount: 2, seed: 7 })
    state = applyAction(state, { type: 'raise', to: 2000 })
    state = applyAction(state, { type: 'call' })
    const result = state.result
    expect(result).not.toBeNull()
    if (result === null) return
    const totalPaid = result.payouts.reduce((sum, amount) => sum + amount, 0)
    expect(totalPaid).toBe(4000)
    expect(state.seats[0].stack + state.seats[1].stack).toBe(4000)
  })
})

// ---------------------------------------------------------------------------
// Property tests. These are the highest value per line in the suite: instead of
// checking one scripted hand, they play hundreds of random ones and assert
// invariants that must hold no matter what happens.
// ---------------------------------------------------------------------------

function randomAction(option: LegalAction, rng: () => number): Action {
  switch (option.type) {
    case 'fold':
      return { type: 'fold' }
    case 'check':
      return { type: 'check' }
    case 'call':
      return { type: 'call' }
    default: {
      const span = option.max - option.min + 1
      return { type: option.type, to: option.min + Math.floor(rng() * span) }
    }
  }
}

describe('invariants over random play', () => {
  it('never creates or destroys a chip', () => {
    for (let seed = 0; seed < 150; seed++) {
      let state = table({ seatCount: 6, seed })
      const startingChips = 6 * 2000
      const rng = mulberry32(seed + 10_000)

      while (state.result === null) {
        const options = legalActions(state)
        state = applyAction(state, randomAction(options[Math.floor(rng() * options.length)], rng))

        const inStacks = state.seats.reduce((sum, seat) => sum + seat.stack, 0)
        if (state.result === null) {
          // Mid-hand: chips are split between stacks and the middle.
          expect(inStacks + potSize(state)).toBe(startingChips)
        } else {
          // Settled: everything has been paid back out to the stacks.
          expect(inStacks).toBe(startingChips)
        }
      }
    }
  })

  it('never deals the same card twice', () => {
    for (let seed = 0; seed < 150; seed++) {
      let state = table({ seatCount: 6, seed })
      const rng = mulberry32(seed + 20_000)
      while (state.result === null) {
        const options = legalActions(state)
        state = applyAction(state, randomAction(options[Math.floor(rng() * options.length)], rng))
      }
      const dealt = [...state.board, ...state.seats.flatMap((seat) => seat.holeCards ?? [])]
      expect(new Set(dealt).size).toBe(dealt.length)
    }
  })

  it('always leaves exactly one player to act, or a finished hand', () => {
    for (let seed = 0; seed < 150; seed++) {
      let state = table({ seatCount: 6, seed })
      const rng = mulberry32(seed + 30_000)
      while (state.result === null) {
        expect(state.currentTurn).not.toBeNull()
        expect(state.seats[state.currentTurn ?? 0].status).toBe('active')
        expect(legalActions(state).length).toBeGreaterThan(0)
        const options = legalActions(state)
        state = applyAction(state, randomAction(options[Math.floor(rng() * options.length)], rng))
      }
      expect(state.currentTurn).toBeNull()
    }
  })

  it('plays a hundred consecutive hands without breaking', () => {
    let state = table({ seatCount: 9, seed: 42 })
    const startingChips = 9 * 2000
    const rng = mulberry32(777)

    for (let hand = 0; hand < 100; hand++) {
      while (state.result === null) {
        const options = legalActions(state)
        state = applyAction(state, randomAction(options[Math.floor(rng() * options.length)], rng))
      }
      expect(state.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(startingChips)

      const stillPlaying = state.seats.filter((seat) => seat.stack > 0).length
      if (stillPlaying < 2) break
      state = nextHand(state)
    }
  })
})
