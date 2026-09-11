import { useEffect, useState } from 'react'
import { legalActions, potSize } from '../engine/hand.ts'
import type { Action, GameState } from '../engine/types.ts'
import { formatChips } from '../utils/format.ts'

type Props = {
  game: GameState
  onAction: (action: Action) => void
  disabled?: boolean
}

const BUTTON =
  'rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export default function ActionBar({ game, onAction, disabled = false }: Props) {
  const options = legalActions(game)
  const raiseOption = options.find((option) => option.type === 'bet' || option.type === 'raise')
  const callOption = options.find((option) => option.type === 'call')
  const canCheck = options.some((option) => option.type === 'check')
  const canFold = options.some((option) => option.type === 'fold')

  const min = raiseOption && 'min' in raiseOption ? raiseOption.min : 0
  const max = raiseOption && 'max' in raiseOption ? raiseOption.max : 0

  // null means "not touched yet", so the slider follows the minimum until the
  // player actually moves it.
  const [chosen, setChosen] = useState<number | null>(null)

  // A new decision is a new spot, so forget whatever was dialled in for the
  // last one. Without this the slider would carry a stale amount across
  // streets.
  useEffect(() => {
    setChosen(null)
  }, [game.currentTurn, game.street, game.betToCall, game.handNumber])

  const clamp = (value: number) => Math.min(Math.max(Math.round(value), min), max)
  const amount = chosen === null ? min : clamp(chosen)

  const pot = potSize(game)
  // Pot-fraction shortcuts must be rounded and clamped: an unclamped 1/2-pot
  // button can easily land below the minimum raise, which the engine rejects.
  const fractionTo = (fraction: number) => clamp(game.betToCall + pot * fraction)

  if (options.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/30 p-3">
      {canFold && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction({ type: 'fold' })}
          className={`${BUTTON} bg-rose-700 text-white hover:bg-rose-600`}
        >
          Fold
        </button>
      )}

      {canCheck && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction({ type: 'check' })}
          className={`${BUTTON} bg-slate-600 text-white hover:bg-slate-500`}
        >
          Check
        </button>
      )}

      {callOption !== undefined && callOption.type === 'call' && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction({ type: 'call' })}
          className={`${BUTTON} bg-sky-700 text-white hover:bg-sky-600`}
        >
          Call {formatChips(callOption.amount)}
        </button>
      )}

      {raiseOption !== undefined && (
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction({ type: raiseOption.type, to: amount })}
            className={`${BUTTON} bg-emerald-700 text-white hover:bg-emerald-600`}
          >
            {raiseOption.type === 'bet' ? 'Bet' : 'Raise to'} {formatChips(amount)}
          </button>

          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={amount}
            disabled={disabled}
            onChange={(event) => setChosen(Number(event.target.value))}
            className="h-2 min-w-40 flex-1 cursor-pointer accent-emerald-500"
            aria-label="Bet size"
          />

          <div className="flex gap-1">
            {[
              { label: '½', fraction: 0.5 },
              { label: '¾', fraction: 0.75 },
              { label: 'Pot', fraction: 1 },
            ].map(({ label, fraction }) => (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => setChosen(fractionTo(fraction))}
                className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setChosen(max)}
              className="rounded border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              All in
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
