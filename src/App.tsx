import { useEffect, useMemo, useReducer, useState } from 'react'
import { decideAction } from './bots/decide.ts'
import { profileForSeat } from './bots/profiles.ts'
import type { Advice, Verdict } from './coach/coach.ts'
import { getAdvice, judgeAction } from './coach/coach.ts'
import ActionBar from './components/ActionBar.tsx'
import CoachPanel from './components/CoachPanel.tsx'
import HandLog from './components/HandLog.tsx'
import Table from './components/Table.tsx'
import { applyAction, nextHand, startTable } from './engine/hand.ts'
import { mulberry32 } from './engine/rng.ts'
import type { Action, GameState, TableConfig } from './engine/types.ts'
import type { PlayerView } from './engine/view.ts'
import { playerView } from './engine/view.ts'
import { formatChips } from './utils/format.ts'

const HERO_SEAT = 0
const NAMES = ['You', 'Ava', 'Ben', 'Cleo', 'Dex', 'Elle', 'Finn', 'Gus', 'Hana']

const TABLE: Omit<TableConfig, 'seed'> = {
  seatCount: 9,
  startingStack: 2000,
  smallBlind: 10,
  bigBlind: 20,
  humanSeat: HERO_SEAT,
  names: NAMES,
}

// Eight opponents means a slow orbit if each one dawdles, so the default is
// brisk and there is a control for it.
const SPEEDS = [
  { label: 'Slow', ms: 900 },
  { label: 'Normal', ms: 420 },
  { label: 'Fast', ms: 120 },
]

const randomSeed = () => Math.floor(Math.random() * 0xffffffff)

type AppState = { game: GameState; error: string | null }

type AppAction =
  | { type: 'act'; action: Action }
  | { type: 'next-hand' }
  | { type: 'new-table'; seed: number }

/**
 * The engine's applyAction(state, action) => state is already a reducer, so it
 * drops straight into useReducer. That is not a coincidence -- a reducer and a
 * rules engine are the same idea: a pure function from current state plus an
 * event to the next state.
 *
 * The try/catch keeps the reducer from ever throwing. An illegal action becomes
 * a visible error message instead of a blank white screen, and the game state
 * is left untouched so play can continue.
 */
function reducer(state: AppState, action: AppAction): AppState {
  try {
    switch (action.type) {
      case 'act':
        return { game: applyAction(state.game, action.action), error: null }
      case 'next-hand':
        return { game: nextHand(state.game), error: null }
      case 'new-table':
        return { game: startTable({ ...TABLE, seed: action.seed }), error: null }
    }
  } catch (error) {
    return { ...state, error: error instanceof Error ? error.message : String(error) }
  }
}

export default function App() {
  const [{ game, error }, dispatch] = useReducer(reducer, undefined, () => ({
    game: startTable({ ...TABLE, seed: randomSeed() }),
    error: null,
  }))
  const [speed, setSpeed] = useState(SPEEDS[1].ms)
  const [hintMode, setHintMode] = useState(false)

  // To review a decision after the fact we need the table as it was BEFORE the
  // action, so it is captured at the moment the action is taken.
  const [lastDecision, setLastDecision] = useState<{ view: PlayerView; action: Action } | null>(
    null,
  )
  const [verdict, setVerdict] = useState<Verdict | null>(null)

  const turn = game.currentTurn
  // Derived, not stored. Anything computable from the game state is worked out
  // during render -- storing it would just be a second copy to keep in sync.
  const handOver = game.result !== null
  const isBotTurn = turn !== null && !handOver && !game.seats[turn].isHuman
  const isHeroTurn = turn !== null && !handOver && game.seats[turn].isHuman
  const hero = game.seats[HERO_SEAT]

  // Running a few thousand simulations on every render would be wasteful, and
  // the answer only changes when the spot does -- which is exactly what useMemo
  // is for.
  const hint: Advice | null = useMemo(
    () => (hintMode && isHeroTurn ? getAdvice(playerView(game, HERO_SEAT)) : null),
    [hintMode, isHeroTurn, game],
  )

  useEffect(() => {
    if (!isBotTurn || turn === null) return

    const timer = setTimeout(() => {
      // Seeded from the state itself, so the same spot always produces the same
      // decision and a hand can be replayed exactly.
      const rng = mulberry32(game.rngState + game.log.length * 7919 + turn)
      const action = decideAction(playerView(game, turn), profileForSeat(turn), rng)
      dispatch({ type: 'act', action })
    }, speed)

    // This cleanup is mandatory, not tidiness. React 19 double-invokes effects
    // in development under StrictMode, so without it every bot would act twice
    // and the table would desync immediately. It also cancels a pending timer
    // if the state moves on for any other reason.
    return () => clearTimeout(timer)
    // `game` is in the deps so each dispatch re-runs this with a fresh closure,
    // which is what stops the timer from ever reading a stale game.
  }, [game, isBotTurn, turn, speed])

  const takeAction = (action: Action) => {
    setLastDecision({ view: playerView(game, HERO_SEAT), action })
    setVerdict(null)
    dispatch({ type: 'act', action })
  }

  const clearCoach = () => {
    setLastDecision(null)
    setVerdict(null)
  }

  return (
    <main className="min-h-dvh bg-felt-900 text-white">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Poker Trainer</h1>
            <p className="text-xs text-white/50">
              9-handed No-Limit Hold&apos;em &middot; blinds {game.smallBlind}/{game.bigBlind}{' '}
              &middot; hand #{game.handNumber}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-white/40">Speed</span>
              {SPEEDS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setSpeed(option.ms)}
                  className={`rounded px-2 py-1 transition-colors ${
                    speed === option.ms
                      ? 'bg-white/20 text-white'
                      : 'text-white/50 hover:bg-white/10'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                clearCoach()
                dispatch({ type: 'new-table', seed: randomSeed() })
              }}
              className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
            >
              New table
            </button>
          </div>
        </header>

        {error !== null && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
            <span className="font-semibold">Something went wrong:</span> {error}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            <Table game={game} heroSeat={HERO_SEAT} />

            {handOver ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <button
                  type="button"
                  onClick={() => {
                    clearCoach()
                    dispatch({ type: 'next-hand' })
                  }}
                  disabled={hero.stack === 0}
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next hand
                </button>
                <span className="text-sm text-white/60">
                  {hero.stack === 0
                    ? 'You are out of chips. Start a new table to keep playing.'
                    : `Your stack: ${formatChips(hero.stack)}`}
                </span>
              </div>
            ) : (
              <ActionBar game={game} onAction={takeAction} disabled={!isHeroTurn} />
            )}
          </div>

          <div className="flex flex-col gap-4 xl:h-[calc(100dvh-7rem)]">
            <div className="min-h-80 flex-1">
              <CoachPanel
                verdict={verdict}
                hint={hint}
                canReview={lastDecision !== null}
                onReview={() => {
                  if (lastDecision !== null) {
                    setVerdict(judgeAction(lastDecision.view, lastDecision.action))
                  }
                }}
                hintMode={hintMode}
                onHintModeChange={setHintMode}
              />
            </div>
            <div className="h-56 shrink-0">
              <HandLog game={game} />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
