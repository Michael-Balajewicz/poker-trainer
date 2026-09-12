import type { ActionRating, Advice, Verdict } from '../coach/coach.ts'
import { formatChips } from '../utils/format.ts'
import CoachLimitations from './CoachLimitations.tsx'

type Props = {
  /** The review of the decision you just made, once you ask for it. */
  verdict: Verdict | null
  /** Live recommendation, only when hint mode is on and it is your turn. */
  hint: Advice | null
  canReview: boolean
  onReview: () => void
  hintMode: boolean
  onHintModeChange: (value: boolean) => void
}

const RATING_STYLE: Record<ActionRating, { label: string; className: string }> = {
  optimal: { label: 'Optimal', className: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' },
  fine: { label: 'Fine', className: 'bg-sky-500/20 text-sky-300 border-sky-400/40' },
  mistake: { label: 'Mistake', className: 'bg-amber-500/20 text-amber-300 border-amber-400/40' },
  blunder: { label: 'Blunder', className: 'bg-rose-500/20 text-rose-300 border-rose-400/40' },
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`

function Numbers({ advice }: { advice: Advice }) {
  const rows: [string, string][] = [
    ['Your equity', percent(advice.equity)],
    ['Opponents', String(advice.opponents)],
    ['Pot', formatChips(advice.potSize)],
    ['To call', advice.toCall === 0 ? 'nothing' : formatChips(advice.toCall)],
  ]
  if (advice.toCall > 0) rows.push(['Equity needed', percent(advice.requiredEquity)])

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="text-white/45">{label}</dt>
          <dd className="font-medium tabular-nums text-white/90">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CandidateTable({ advice, chosenLabel }: { advice: Advice; chosenLabel?: string }) {
  if (advice.candidates.length === 0) return null

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-white/40">
          <th className="py-1 text-left font-normal">Option</th>
          <th className="py-1 text-right font-normal">Expected value</th>
        </tr>
      </thead>
      <tbody>
        {advice.candidates.map((candidate, index) => {
          const isBest = index === 0
          const isChosen = candidate.label === chosenLabel
          return (
            <tr
              key={candidate.label}
              className={
                isBest
                  ? 'text-emerald-300'
                  : isChosen
                    ? 'text-amber-300'
                    : 'text-white/60'
              }
            >
              <td className="py-0.5">
                {candidate.label}
                {isBest && <span className="ml-1 text-[10px] text-white/40">best</span>}
                {isChosen && !isBest && (
                  <span className="ml-1 text-[10px] text-white/40">you</span>
                )}
              </td>
              <td className="py-0.5 text-right tabular-nums">
                {candidate.ev >= 0 ? '+' : ''}
                {candidate.ev.toFixed(0)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function CoachPanel({
  verdict,
  hint,
  canReview,
  onReview,
  hintMode,
  onHintModeChange,
}: Props) {
  const shown: Advice | null = verdict ?? hint

  return (
    <div className="flex h-full flex-col rounded-lg border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">Coach</h2>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/50">
          <input
            type="checkbox"
            checked={hintMode}
            onChange={(event) => onHintModeChange(event.target.checked)}
            className="accent-emerald-500"
          />
          Hint before acting
        </label>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <button
          type="button"
          onClick={onReview}
          disabled={!canReview}
          className="w-full rounded-md bg-indigo-700 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          How did I do?
        </button>

        {verdict !== null && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                  RATING_STYLE[verdict.rating].className
                }`}
              >
                {RATING_STYLE[verdict.rating].label}
              </span>
              <span className="text-xs text-white/60">You {verdict.chosen.label.toLowerCase()}</span>
            </div>

            {verdict.chosen.label !== verdict.best.label && (
              <p className="text-xs text-white/70">
                The coach would <span className="font-semibold text-white">{verdict.best.label}</span>
                {verdict.evLoss !== null && verdict.evLoss > 0 && (
                  <> &mdash; worth about {formatChips(Math.round(verdict.evLoss))} more chips</>
                )}
                .
              </p>
            )}
          </div>
        )}

        {verdict === null && hint !== null && (
          <div className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-xs">
            <span className="text-white/50">Suggested:</span>{' '}
            <span className="font-semibold text-emerald-300">{hint.best.label}</span>
          </div>
        )}

        {shown !== null && (
          <>
            <p className="text-xs leading-relaxed text-white/70">{shown.explanation}</p>
            <Numbers advice={shown} />
            <CandidateTable advice={shown} chosenLabel={verdict?.chosen.label} />
            <p className="text-[10px] text-white/30">
              {shown.source === 'preflop-chart'
                ? 'From a positional range chart. Equity shown for reference only.'
                : `${shown.iterations.toLocaleString('en-US')} simulations in ${shown.computeMs.toFixed(0)}ms.`}
            </p>
          </>
        )}

        {shown === null && (
          <p className="text-xs leading-relaxed text-white/40">
            Make a decision, then ask the coach whether it was the right one. Turn on hints above if
            you would rather see the recommendation before you act.
          </p>
        )}
      </div>

      <CoachLimitations />
    </div>
  )
}
