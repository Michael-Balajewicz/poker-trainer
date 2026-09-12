import type { Seat } from '../engine/types.ts'
import { formatChips } from '../utils/format.ts'
import CardView from './CardView.tsx'

type Props = {
  seat: Seat
  position: string | null
  isButton: boolean
  isTurn: boolean
  /** Whether this seat's hole cards are face up. */
  revealed: boolean
  /** Set when the hand is over and this seat won something. */
  won: number
}

export default function SeatView({ seat, position, isButton, isTurn, revealed, won }: Props) {
  if (seat.status === 'out') {
    return (
      <div className="w-24 rounded-lg border border-white/5 bg-black/20 px-1.5 py-1 text-center text-[10px] text-white/25 lg:w-32 lg:px-2 lg:py-1.5 lg:text-xs">
        {seat.name}
        <div>busted</div>
      </div>
    )
  }

  const folded = seat.status === 'folded'

  return (
    <div
      className={`relative w-24 rounded-lg border px-1.5 py-1 text-center transition-colors lg:w-32 lg:px-2 lg:py-1.5 ${
        isTurn
          ? 'border-amber-300 bg-amber-300/15 shadow-lg shadow-amber-300/20'
          : 'border-white/10 bg-black/40'
      } ${folded ? 'opacity-40' : ''}`}
    >
      {isButton && (
        <span
          className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-900"
          title="Dealer button"
        >
          D
        </span>
      )}

      <div className="flex justify-center gap-1 pb-1">
        {seat.holeCards === null ? (
          <>
            <CardView card={null} size="sm" />
            <CardView card={null} size="sm" />
          </>
        ) : (
          seat.holeCards.map((card, i) => (
            <CardView key={i} card={card} hidden={!revealed} size="sm" />
          ))
        )}
      </div>

      <div className="truncate text-xs font-medium text-white/90">
        {seat.name}
        {position !== null && <span className="ml-1 text-white/40">{position}</span>}
      </div>

      <div className="text-sm font-semibold tabular-nums text-chip-gold">
        {formatChips(seat.stack)}
      </div>

      {seat.status === 'allin' && (
        <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-300">
          All in
        </div>
      )}
      {folded && <div className="text-[10px] uppercase tracking-wide text-white/40">Folded</div>}

      {seat.committedThisStreet > 0 && (
        <div className="mt-1 inline-block rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums text-white/80">
          {formatChips(seat.committedThisStreet)}
        </div>
      )}

      {won > 0 && (
        <div className="mt-1 text-[11px] font-semibold text-emerald-300">
          +{formatChips(won)}
        </div>
      )}
    </div>
  )
}
