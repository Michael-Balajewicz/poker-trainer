import { describe, expect, it } from 'vitest'
import type { Card } from '../engine/cards.ts'
import { parseCards } from '../engine/cards.ts'
import { applyAction, legalActions, nextHand, startTable } from '../engine/hand.ts'
import { mulberry32 } from '../engine/rng.ts'
import type { GameState } from '../engine/types.ts'
import { playerView } from '../engine/view.ts'
import { decideAction } from './decide.ts'
import { chenScore } from './decide.ts'
import { LOOSE_PASSIVE, TIGHT_AGGRESSIVE, profileForSeat } from './profiles.ts'

const hole = (text: string): [Card, Card] => {
  const cards = parseCards(text)
  return [cards[0], cards[1]]
}

function allBotTable(seed: number, seatCount = 9): GameState {
  return startTable({
    seatCount,
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
    humanSeat: -1, // nobody is human, so the whole table is bots
    seed,
    names: [],
  })
}

describe('Chen formula', () => {
  it('scores the benchmark hands', () => {
    expect(chenScore(hole('As Ad'))).toBe(20)
    expect(chenScore(hole('Ks Kd'))).toBe(16)
    expect(chenScore(hole('2s 2d'))).toBe(5) // even the worst pair has a floor
    expect(chenScore(hole('As Ks'))).toBe(12)
    expect(chenScore(hole('Ah Kd'))).toBe(10)
    expect(chenScore(hole('Js Ts'))).toBe(9)
  })

  it('ranks trash below premium hands', () => {
    expect(chenScore(hole('7h 2c'))).toBeLessThan(chenScore(hole('Ah Kd')))
    expect(chenScore(hole('7h 2c'))).toBeLessThan(0)
  })

  it('rewards being suited and connected', () => {
    expect(chenScore(hole('9h 8h'))).toBeGreaterThan(chenScore(hole('9h 8c')))
    expect(chenScore(hole('9h 8c'))).toBeGreaterThan(chenScore(hole('9h 4c')))
  })
})

describe('bot behaviour', () => {
  it('never returns an illegal action across many full hands', () => {
    // applyAction validates every action, so an illegal bot decision throws
    // here rather than silently corrupting the hand.
    for (let seed = 0; seed < 100; seed++) {
      let state = allBotTable(seed)
      const rng = mulberry32(seed + 555)
      let guard = 0

      while (state.result === null && guard++ < 500) {
        const turn = state.currentTurn
        expect(turn).not.toBeNull()
        if (turn === null) break
        const action = decideAction(playerView(state, turn), profileForSeat(turn), rng)
        state = applyAction(state, action)
      }

      expect(state.result).not.toBeNull()
    }
  })

  it('plays fifty consecutive hands without breaking the table', () => {
    let state = allBotTable(31)
    const rng = mulberry32(31)

    for (let hand = 0; hand < 50; hand++) {
      while (state.result === null) {
        const turn = state.currentTurn
        if (turn === null) break
        state = applyAction(state, decideAction(playerView(state, turn), profileForSeat(turn), rng))
      }
      expect(state.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(9 * 2000)
      if (state.seats.filter((seat) => seat.stack > 0).length < 2) break
      state = nextHand(state)
    }
  })

  it('only ever sees its own hole cards', () => {
    const state = allBotTable(4)
    const turn = state.currentTurn ?? 0
    const view = playerView(state, turn)
    for (const seat of view.seats) {
      if (seat.id === turn) expect(seat.holeCards).not.toBeNull()
      else expect(seat.holeCards).toBeNull()
    }
    expect(Object.hasOwn(view, 'deck')).toBe(false)
  })

  it('folds trash and continues with premium hands preflop', () => {
    // Facing a raise with the tightest profile, 72o should always fold and
    // aces should never fold, regardless of the random jitter.
    let foldedTrash = 0
    let foldedAces = 0

    for (let seed = 0; seed < 50; seed++) {
      const base = allBotTable(seed, 6)
      const turn = base.currentTurn ?? 0
      const rng = mulberry32(seed)

      const withTrash = structuredClone(base)
      withTrash.seats[turn].holeCards = hole('7h 2c')
      if (decideAction(playerView(withTrash, turn), TIGHT_AGGRESSIVE, rng).type === 'fold') {
        foldedTrash++
      }

      const withAces = structuredClone(base)
      withAces.seats[turn].holeCards = hole('As Ad')
      if (decideAction(playerView(withAces, turn), TIGHT_AGGRESSIVE, rng).type === 'fold') {
        foldedAces++
      }
    }

    expect(foldedTrash).toBe(50)
    expect(foldedAces).toBe(0)
  })

  it('gives the loose profile a wider range than the tight one', () => {
    let looseEntries = 0
    let tightEntries = 0

    for (let seed = 0; seed < 200; seed++) {
      const state = allBotTable(seed, 6)
      const turn = state.currentTurn ?? 0
      const view = playerView(state, turn)
      if (decideAction(view, LOOSE_PASSIVE, mulberry32(seed)).type !== 'fold') looseEntries++
      if (decideAction(view, TIGHT_AGGRESSIVE, mulberry32(seed)).type !== 'fold') tightEntries++
    }

    expect(looseEntries).toBeGreaterThan(tightEntries)
  })

  it('checks rather than folding when it is free to see a card', () => {
    // Give a bot the worst possible hand in a spot where checking is free; it
    // must never throw away a free card.
    let state = allBotTable(12, 4)
    while (state.street === 'preflop' && state.result === null) {
      if (state.currentTurn === null) break
      // The big blind closes the round with a check, not a call.
      const canCall = legalActions(state).some((option) => option.type === 'call')
      state = applyAction(state, canCall ? { type: 'call' } : { type: 'check' })
    }
    if (state.result !== null || state.currentTurn === null) return

    const turn = state.currentTurn
    expect(legalActions(state).some((option) => option.type === 'check')).toBe(true)
    const junk = structuredClone(state)
    junk.seats[turn].holeCards = hole('7h 2c')
    const action = decideAction(playerView(junk, turn), LOOSE_PASSIVE, mulberry32(1))
    expect(action.type).not.toBe('fold')
  })
})
