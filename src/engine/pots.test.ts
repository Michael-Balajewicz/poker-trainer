import { describe, expect, it } from 'vitest'
import { buildPots, orderFromButton, splitPot } from './pots.ts'
import type { Seat, SeatStatus } from './types.ts'

function seat(id: number, committedThisHand: number, status: SeatStatus): Seat {
  return {
    id,
    name: `Seat ${id}`,
    isHuman: false,
    stack: 0,
    committedThisStreet: 0,
    committedThisHand,
    holeCards: null,
    status,
    hasActed: true,
  }
}

describe('building pots', () => {
  it('makes a single pot when everyone put in the same amount', () => {
    const pots = buildPots([seat(0, 100, 'active'), seat(1, 100, 'active')])
    expect(pots).toEqual([{ amount: 200, eligible: [0, 1] }])
  })

  it('layers three unequal all-ins into three pots', () => {
    const pots = buildPots([
      seat(0, 300, 'allin'),
      seat(1, 200, 'allin'),
      seat(2, 100, 'allin'),
    ])
    expect(pots).toEqual([
      { amount: 300, eligible: [0, 1, 2] }, // everyone matched 100
      { amount: 200, eligible: [0, 1] }, // only two matched the next 100
      { amount: 100, eligible: [0] }, // the top slice is the uncalled part
    ])
  })

  it('counts folded players money but never makes them eligible', () => {
    const pots = buildPots([
      seat(0, 100, 'active'),
      seat(1, 100, 'active'),
      seat(2, 40, 'folded'), // called 40, then folded to a raise
    ])
    expect(pots).toEqual([{ amount: 240, eligible: [0, 1] }])
  })

  it('returns an uncalled bet to the bettor with no special case', () => {
    // Shoved 500, called for only 200. The top layer has one eligible player,
    // so it comes straight back.
    const pots = buildPots([seat(0, 500, 'active'), seat(1, 200, 'allin')])
    expect(pots).toEqual([
      { amount: 400, eligible: [0, 1] },
      { amount: 300, eligible: [0] },
    ])
  })

  it('handles a folded player who committed more than a short all-in', () => {
    const pots = buildPots([
      seat(0, 200, 'allin'),
      seat(1, 200, 'active'),
      seat(2, 150, 'folded'),
    ])
    expect(pots).toEqual([{ amount: 550, eligible: [0, 1] }])
  })

  it('conserves chips across every layer', () => {
    const seats = [
      seat(0, 1000, 'allin'),
      seat(1, 640, 'allin'),
      seat(2, 640, 'active'),
      seat(3, 120, 'folded'),
      seat(4, 20, 'folded'),
    ]
    const committed = seats.reduce((sum, s) => sum + s.committedThisHand, 0)
    const potted = buildPots(seats).reduce((sum, p) => sum + p.amount, 0)
    expect(potted).toBe(committed)
  })

  it('produces no pots when nobody has committed anything yet', () => {
    expect(buildPots([seat(0, 0, 'active'), seat(1, 0, 'active')])).toEqual([])
  })
})

describe('splitting a pot', () => {
  it('divides evenly when it can', () => {
    expect(splitPot(200, [1, 2], 9, 0)).toEqual([
      { seat: 1, amount: 100 },
      { seat: 2, amount: 100 },
    ])
  })

  it('gives the odd chip to the first winner left of the button', () => {
    expect(splitPot(101, [1, 2], 9, 0)).toEqual([
      { seat: 1, amount: 51 },
      { seat: 2, amount: 50 },
    ])
  })

  it('follows the button when it moves', () => {
    // Button on seat 1 now, so seat 2 is first clockwise and takes the extra.
    expect(splitPot(101, [1, 2], 9, 1)).toEqual([
      { seat: 2, amount: 51 },
      { seat: 1, amount: 50 },
    ])
  })

  it('spreads several odd chips one at a time', () => {
    const awards = splitPot(302, [0, 1, 2], 9, 8)
    expect(awards.map((a) => a.amount)).toEqual([101, 101, 100])
    expect(awards.reduce((sum, a) => sum + a.amount, 0)).toBe(302)
  })

  it('orders seats clockwise from the button, wrapping around', () => {
    expect(orderFromButton(9, 7, [0, 3, 8])).toEqual([8, 0, 3])
  })
})
