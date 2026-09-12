// The decision coach.
//
// THIS IS THE SEAM. Everything the UI knows about coaching is the Advice and
// Verdict types plus two functions; the reasoning behind them can be replaced
// wholesale without touching a component.
//
//   getAdvice(view)          -> what to do, for hint mode
//   judgeAction(view, action) -> how the decision you made scored, for review
//
// They are two functions over one core rather than one function called per
// action, because the equity simulation is SHARED across every candidate. A
// single evaluate(action) called five times would run Monte Carlo five times
// and produce identical numbers at five times the cost.
//
// What this is not: a solver. It judges decisions on raw equity and pot odds.
// The limitations are listed in components/CoachLimitations.tsx and shown in
// the app on purpose -- keep that panel honest as this file gets smarter.

import type { Card } from '../engine/cards.ts'
import { rankOf, suitOf } from '../engine/cards.ts'
import { amountToCall, legalActions, potSize } from '../engine/hand.ts'
import type { Action } from '../engine/types.ts'
import type { PlayerView } from '../engine/view.ts'
import { liveOpponents } from '../engine/view.ts'
import { positionNames } from '../utils/format.ts'
import { seedForSpot, simulateEquity } from './equity.ts'
import { bucketFor, consultChart } from './preflop.ts'
import { mulberry32 } from '../engine/rng.ts'

export type ActionRating = 'optimal' | 'fine' | 'mistake' | 'blunder'

export type CandidateEV = {
  action: Action
  label: string
  /** Expected chips gained relative to folding, which is always zero. */
  ev: number
}

export type Advice = {
  source: 'preflop-chart' | 'monte-carlo'
  best: CandidateEV
  /** Ranked best first. Empty on the chart path, which has no EV model. */
  candidates: CandidateEV[]
  equity: number
  potOdds: number
  requiredEquity: number
  potSize: number
  toCall: number
  opponents: number
  iterations: number
  computeMs: number
  explanation: string
}

export type Verdict = Advice & {
  chosen: CandidateEV
  rating: ActionRating
  /** null on the chart path: inventing a number there would be fake precision. */
  evLoss: number | null
}

// How often opponents are assumed to fold to a raise. This is the weakest
// number in the file -- a guess shaped like a model, not a model. It is the
// first thing worth replacing with something real.
const FOLD_EQUITY_BASE = 0.2
const FOLD_EQUITY_SCALE = 0.35

// More trials on earlier streets, where there is more still to come. At these
// counts the sampling error on equity is roughly +/- 0.7-1.1%.
const ITERATIONS = { preflop: 2000, flop: 5000, turn: 3000, river: 2000 }

// Rated in big blinds so the thresholds mean the same thing at any stake.
const RATING_THRESHOLDS: { max: number; rating: ActionRating }[] = [
  { max: 0.05, rating: 'optimal' },
  { max: 0.5, rating: 'fine' },
  { max: 2, rating: 'mistake' },
]

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high)

function labelFor(action: Action): string {
  switch (action.type) {
    case 'fold':
      return 'Fold'
    case 'check':
      return 'Check'
    case 'call':
      return 'Call'
    case 'bet':
      return `Bet ${action.to}`
    case 'raise':
      return `Raise to ${action.to}`
  }
}

/**
 * Expected chips from one action, relative to folding.
 *
 * EV(fold)       = 0
 * EV(check/call) = E x (P + C) - C        (check is just call with C = 0)
 *
 * Break-even on that second line is E = C / (P + C), which IS pot odds -- so
 * the required equity shown in the UI and the EV model can never disagree.
 * It also means a free check always beats folding, with no special case.
 */
function evForAction(
  action: Action,
  view: PlayerView,
  equity: number,
  pot: number,
  toCall: number,
): number {
  const hero = view.seats[view.heroSeat]

  switch (action.type) {
    case 'fold':
      return 0
    case 'check':
      return equity * pot
    case 'call':
      return equity * (pot + toCall) - toCall
    case 'bet':
    case 'raise': {
      const added = action.to - hero.committedThisStreet // hero's extra chips
      const called = Math.max(0, action.to - view.betToCall) // a caller's top-up
      const foldChance = clamp(
        FOLD_EQUITY_BASE + FOLD_EQUITY_SCALE * (added / (pot + added)),
        0.05,
        0.75,
      )
      const everyoneFolds = foldChance ** Math.max(1, liveOpponents(view))
      const whenCalled = equity * (pot + added + called) - added
      return everyoneFolds * pot + (1 - everyoneFolds) * whenCalled
    }
  }
}

/** Discrete raise sizes to consider, since legalActions only gives a range. */
function raiseCandidates(view: PlayerView, pot: number): number[] {
  const option = legalActions(view).find(
    (entry) => entry.type === 'bet' || entry.type === 'raise',
  )
  if (option === undefined || (option.type !== 'bet' && option.type !== 'raise')) return []

  const sizes = [0.33, 0.75, 1.5]
    .map((fraction) => Math.round(view.betToCall + pot * fraction))
    .concat(option.max)
    .map((to) => clamp(to, option.min, option.max))

  return [...new Set(sizes)].sort((a, b) => a - b)
}

export function getAdvice(view: PlayerView): Advice {
  const started = performance.now()
  const hero = view.seats[view.heroSeat]
  const hole = hero.holeCards
  const pot = potSize(view)
  const toCall = amountToCall(view, view.heroSeat)
  const opponents = liveOpponents(view)
  const options = legalActions(view)

  const potOdds = toCall === 0 ? 0 : toCall / (pot + toCall)
  const emptyBest: CandidateEV = { action: { type: 'fold' }, label: 'Fold', ev: 0 }

  if (hole === null || options.length === 0) {
    return {
      source: 'monte-carlo',
      best: emptyBest,
      candidates: [],
      equity: 0,
      potOdds,
      requiredEquity: potOdds,
      potSize: pot,
      toCall,
      opponents,
      iterations: 0,
      computeMs: 0,
      explanation: 'There is no decision to make here.',
    }
  }

  // Seeded from the spot itself, so asking twice gives the same answer twice.
  const rng = mulberry32(
    seedForSpot([
      hole[0],
      hole[1],
      ...view.board,
      view.board.length,
      pot,
      toCall,
      opponents,
    ]),
  )

  const iterations = ITERATIONS[view.street]
  const { equity } = simulateEquity({
    hero: hole,
    board: view.board,
    opponents: Math.max(1, opponents),
    iterations,
    rng,
  })

  if (view.street === 'preflop') {
    return preflopAdvice(view, hole, {
      equity,
      pot,
      toCall,
      potOdds,
      opponents,
      iterations,
      started,
    })
  }

  const candidates: CandidateEV[] = []
  const add = (action: Action) =>
    candidates.push({
      action,
      label: labelFor(action),
      ev: evForAction(action, view, equity, pot, toCall),
    })

  for (const option of options) {
    if (option.type === 'fold') add({ type: 'fold' })
    else if (option.type === 'check') add({ type: 'check' })
    else if (option.type === 'call') add({ type: 'call' })
  }
  const raiseType = options.some((option) => option.type === 'bet') ? 'bet' : 'raise'
  for (const to of raiseCandidates(view, pot)) add({ type: raiseType, to })

  candidates.sort((a, b) => b.ev - a.ev)
  const best = candidates[0] ?? emptyBest

  return {
    source: 'monte-carlo',
    best,
    candidates,
    equity,
    potOdds,
    requiredEquity: potOdds,
    potSize: pot,
    toCall,
    opponents,
    iterations,
    computeMs: performance.now() - started,
    explanation: explainPostflop(equity, potOdds, toCall, opponents, best),
  }
}

function preflopAdvice(
  view: PlayerView,
  hole: [Card, Card],
  numbers: {
    equity: number
    pot: number
    toCall: number
    potOdds: number
    opponents: number
    iterations: number
    started: number
  },
): Advice {
  const options = legalActions(view)
  const positions = positionNames(view.seats, view.buttonIndex)
  const chart = consultChart({
    hole,
    bucket: bucketFor(positions[view.heroSeat]),
    facingRaise: view.betToCall > view.bigBlind,
    canCheck: options.some((option) => option.type === 'check'),
  })

  // Turn the chart's verdict into a concrete action at a sensible size.
  const raiseOption = options.find((entry) => entry.type === 'bet' || entry.type === 'raise')
  let action: Action = { type: 'fold' }
  if (chart.recommended === 'raise' && raiseOption !== undefined && 'min' in raiseOption) {
    const standard = view.betToCall > view.bigBlind ? view.betToCall * 3 : view.bigBlind * 3
    action = {
      type: raiseOption.type,
      to: clamp(Math.round(standard), raiseOption.min, raiseOption.max),
    }
  } else if (chart.recommended === 'call') {
    action = { type: 'call' }
  } else if (chart.recommended === 'check') {
    action = { type: 'check' }
  }

  return {
    source: 'preflop-chart',
    best: { action, label: labelFor(action), ev: 0 },
    candidates: [],
    equity: numbers.equity,
    potOdds: numbers.potOdds,
    requiredEquity: numbers.potOdds,
    potSize: numbers.pot,
    toCall: numbers.toCall,
    opponents: numbers.opponents,
    iterations: numbers.iterations,
    computeMs: performance.now() - numbers.started,
    explanation: `${describeHand(hole)} from ${chart.bucket}. ${chart.reason}`,
  }
}

function describeHand(hole: readonly [Card, Card]): string {
  const first = rankOf(hole[0])
  const second = rankOf(hole[1])
  const names = '23456789TJQKA'
  if (first === second) return `A pair of ${names[first]}s`
  const suited = suitOf(hole[0]) === suitOf(hole[1])
  const high = names[Math.max(first, second)]
  const low = names[Math.min(first, second)]
  return `${high}${low} ${suited ? 'suited' : 'offsuit'}`
}

function explainPostflop(
  equity: number,
  potOdds: number,
  toCall: number,
  opponents: number,
  best: CandidateEV,
): string {
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`
  const against = `against ${opponents} opponent${opponents === 1 ? '' : 's'}`

  if (toCall === 0) {
    return `You win ${pct(equity)} of the time ${against}, and it costs nothing to see the next card. ${best.label} has the highest expected value here.`
  }

  const verdict =
    equity >= potOdds
      ? `that is more than the ${pct(potOdds)} you need, so calling is profitable on its own`
      : `that is less than the ${pct(potOdds)} you need to break even on a call`

  return `You win ${pct(equity)} of the time ${against}, and ${verdict}. ${best.label} has the highest expected value.`
}

export function judgeAction(view: PlayerView, action: Action): Verdict {
  const advice = getAdvice(view)

  const chosen: CandidateEV = {
    action,
    label: labelFor(action),
    ev:
      advice.source === 'preflop-chart'
        ? 0
        : evForAction(action, view, advice.equity, advice.potSize, advice.toCall),
  }

  if (advice.source === 'preflop-chart') {
    return { ...advice, chosen, rating: rateAgainstChart(advice.best.action, action), evLoss: null }
  }

  const evLoss = Math.max(0, advice.best.ev - chosen.ev)
  const inBigBlinds = evLoss / view.bigBlind
  const rating =
    RATING_THRESHOLDS.find((threshold) => inBigBlinds <= threshold.max)?.rating ?? 'blunder'

  return { ...advice, chosen, rating, evLoss }
}

/** Preflop has no EV model behind it, so the rating is a direct comparison. */
function rateAgainstChart(recommended: Action, taken: Action): ActionRating {
  const want = recommended.type
  const got = taken.type
  if (want === got) return 'optimal'

  const aggressive = got === 'raise' || got === 'bet'
  const wantAggressive = want === 'raise' || want === 'bet'

  // Playing a hand the chart wanted raised, just more passively.
  if (wantAggressive && got === 'call') return 'fine'
  // Raising something the chart only wanted called is defensible.
  if (want === 'call' && aggressive) return 'fine'
  if (want === 'check' && aggressive) return 'fine'

  if (wantAggressive && got === 'fold') return 'blunder'
  if (want === 'call' && got === 'fold') return 'mistake'
  if (want === 'fold' && (got === 'call' || aggressive)) return 'mistake'

  return 'fine'
}
