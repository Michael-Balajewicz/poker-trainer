import { describe, expect, it } from 'vitest'
import type { Card } from '../engine/cards.ts'
import { parseCards } from '../engine/cards.ts'
import type { Seat, Street } from '../engine/types.ts'
import type { PlayerView } from '../engine/view.ts'
import { getAdvice, judgeAction } from './coach.ts'

const hole = (text: string): [Card, Card] => {
  const cards = parseCards(text)
  return [cards[0], cards[1]]
}

function seat(id: number, overrides: Partial<Seat> = {}): Seat {
  return {
    id,
    name: id === 0 ? 'You' : `Bot ${id}`,
    isHuman: id === 0,
    stack: 2000,
    committedThisStreet: 0,
    committedThisHand: 0,
    holeCards: null,
    status: 'active',
    hasActed: false,
    ...overrides,
  }
}

function baseView(seats: Seat[], overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    seats,
    buttonIndex: 0,
    street: 'flop',
    board: [],
    currentTurn: 0,
    betToCall: 0,
    lastRaiseSize: 20,
    smallBlind: 10,
    bigBlind: 20,
    handNumber: 1,
    rngState: 1,
    log: [],
    result: null,
    heroSeat: 0,
    ...overrides,
  }
}

/** Heads-up postflop spot: hero to act, optionally facing a bet. */
function postflopSpot(args: {
  holeText: string
  boardText: string
  priorPot?: number
  bet?: number
  street?: Street
}): PlayerView {
  const { holeText, boardText, priorPot = 100, bet = 0, street = 'flop' } = args
  return baseView(
    [
      seat(0, { holeCards: hole(holeText), committedThisHand: priorPot / 2 }),
      seat(1, {
        committedThisStreet: bet,
        committedThisHand: priorPot / 2 + bet,
        hasActed: true,
      }),
    ],
    { street, board: parseCards(boardText), betToCall: bet },
  )
}

/** Full-ring preflop spot with the hero in a chosen seat. */
function preflopSpot(holeText: string, heroSeat: number): PlayerView {
  const seats = Array.from({ length: 9 }, (_, id) => seat(id))
  seats[1].committedThisStreet = 10
  seats[1].committedThisHand = 10
  seats[2].committedThisStreet = 20
  seats[2].committedThisHand = 20
  seats[heroSeat].holeCards = hole(holeText)

  return baseView(seats, {
    street: 'preflop',
    betToCall: 20,
    currentTurn: heroSeat,
    heroSeat,
  })
}

describe('postflop advice', () => {
  it('rates folding a flopped nut flush a blunder', () => {
    const spot = postflopSpot({
      holeText: 'As Ks',
      boardText: 'Qs 7s 2s',
      priorPot: 200,
      bet: 100,
    })
    const verdict = judgeAction(spot, { type: 'fold' })

    expect(verdict.rating).toBe('blunder')
    expect(verdict.equity).toBeGreaterThan(0.9)
    expect(verdict.evLoss).not.toBeNull()
    expect(verdict.evLoss ?? 0).toBeGreaterThan(2 * spot.bigBlind)
    expect(verdict.best.action.type).not.toBe('fold')
  })

  it('rates folding seven-high to a big bet optimal', () => {
    const spot = postflopSpot({
      holeText: '7c 2d',
      boardText: 'As Ks Qh 8d',
      priorPot: 200,
      bet: 400,
      street: 'turn',
    })
    const verdict = judgeAction(spot, { type: 'fold' })

    expect(verdict.best.action.type).toBe('fold')
    expect(verdict.rating).toBe('optimal')
    expect(verdict.evLoss).toBe(0)
  })

  it('never prefers folding when checking is free', () => {
    const spot = postflopSpot({ holeText: '7c 2d', boardText: 'As Ks Qh', bet: 0 })
    const advice = getAdvice(spot)
    // Fold is not even offered, and whatever wins must beat doing nothing.
    expect(advice.candidates.some((entry) => entry.action.type === 'fold')).toBe(false)
    expect(advice.best.ev).toBeGreaterThan(0)
  })

  it('reports required equity that matches the pot odds being offered', () => {
    const spot = postflopSpot({
      holeText: 'Js Th',
      boardText: '9s 8d 2c',
      priorPot: 200,
      bet: 100,
    })
    const advice = getAdvice(spot)
    // 100 to call into a 300 pot is exactly one in four.
    expect(advice.toCall).toBe(100)
    expect(advice.potSize).toBe(300)
    expect(advice.requiredEquity).toBeCloseTo(0.25, 5)
  })

  it('ranks its candidates best first and offers several bet sizes', () => {
    const spot = postflopSpot({ holeText: 'As Ks', boardText: 'Qs 7s 2s', priorPot: 200 })
    const advice = getAdvice(spot)

    expect(advice.candidates.length).toBeGreaterThan(2)
    for (let i = 1; i < advice.candidates.length; i++) {
      expect(advice.candidates[i - 1].ev).toBeGreaterThanOrEqual(advice.candidates[i].ev)
    }
    expect(advice.best).toEqual(advice.candidates[0])
  })

  it('gives the same verdict twice for the same spot', () => {
    const spot = postflopSpot({
      holeText: 'Js Th',
      boardText: '9s 8d 2c',
      priorPot: 200,
      bet: 100,
    })
    const first = judgeAction(spot, { type: 'call' })
    const second = judgeAction(spot, { type: 'call' })

    expect(first.equity).toBe(second.equity)
    expect(first.rating).toBe(second.rating)
    expect(first.best.label).toBe(second.best.label)
  })

  it('stays fast enough to feel instant', () => {
    const spot = postflopSpot({ holeText: 'Js Th', boardText: '9s 8d 2c', priorPot: 200 })
    expect(getAdvice(spot).computeMs).toBeLessThan(150)
  })
})

describe('preflop advice', () => {
  it('opens aces from early position', () => {
    const advice = getAdvice(preflopSpot('As Ad', 3))
    expect(advice.source).toBe('preflop-chart')
    expect(advice.best.action.type).toBe('raise')
    expect(advice.explanation).toContain('pair of As')
  })

  it('rates folding aces a blunder', () => {
    const verdict = judgeAction(preflopSpot('As Ad', 3), { type: 'fold' })
    expect(verdict.rating).toBe('blunder')
    // No EV model behind the chart, so no invented number.
    expect(verdict.evLoss).toBeNull()
  })

  it('folds seven-deuce from early position, and rates that optimal', () => {
    const spot = preflopSpot('7h 2c', 3)
    expect(getAdvice(spot).best.action.type).toBe('fold')
    expect(judgeAction(spot, { type: 'fold' }).rating).toBe('optimal')
  })

  it('opens far wider on the button than under the gun', () => {
    // A hand that is a fine button open but a clear early-position fold.
    expect(getAdvice(preflopSpot('Jh 9h', 0)).best.action.type).toBe('raise')
    expect(getAdvice(preflopSpot('Jh 9h', 3)).best.action.type).toBe('fold')
  })

  it('treats calling a hand the chart wants raised as merely passive', () => {
    expect(judgeAction(preflopSpot('As Ad', 3), { type: 'call' }).rating).toBe('fine')
  })

  it('rates entering with trash a mistake', () => {
    expect(judgeAction(preflopSpot('7h 2c', 3), { type: 'call' }).rating).toBe('mistake')
  })
})
