import { useState } from 'react'

// Shown in the app on purpose. The point of a trainer is that you trust its
// numbers exactly as much as they deserve, so the shortcuts are stated rather
// than buried. Keep this honest as coach/coach.ts gets smarter.
const LIMITATIONS = [
  'Equity is measured against completely random opponent hands, not realistic ranges. Real opponents fold their worst hands, so the equity shown here reads high.',
  'Fold equity is a crude function of bet size. It is a guess, not a model of how these opponents actually play.',
  'No future streets. Every number assumes the hand checks down after this action, so there are no implied odds and no multi-street planning.',
  'No blockers, board texture, or range advantage.',
  'No opponent modelling. The coach does not adapt to a specific bot, even though we know exactly how each one plays.',
  'Only three or four bet sizes are considered, so "best" means best of those, not best of all possible sizes.',
  'Preflop comes from a fixed chart. Real optimal play mixes -- raising a hand 70% of the time and folding it 30% -- which a chart cannot express.',
  'Monte Carlo sampling noise is roughly plus or minus 1% on equity.',
]

export default function CoachLimitations() {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-white/10 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left text-[11px] text-white/40 hover:text-white/70"
      >
        <span>What this coach does not do</span>
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="pt-2 text-[11px] leading-relaxed text-white/50">
          <p className="mb-2 text-white/70">
            This checks whether your decision was reasonable on raw equity and pot odds. It is not
            a solver.
          </p>
          <ul className="list-disc space-y-1 pl-4">
            {LIMITATIONS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
