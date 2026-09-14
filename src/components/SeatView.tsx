import type { Seat } from '../engine/types.ts'
import { formatChips } from '../utils/format.ts'
import Avatar from './Avatar.tsx'
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

const PILL = 'rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums'

/**
 * One player: hole cards tucked over a round avatar, a rounded name plate
 * underneath, and a row for their chips and status.
 *
 * Every seat is exactly the same height whatever it is showing -- the bottom
 * row is always there, even when empty. Seats are centred on the table's rail,
 * so a seat that grew when a bet appeared would visibly jump.
 */
export default function SeatView({ seat, position, isButton, isTurn, revealed, won }: Props) {
  const out = seat.status === 'out'
  const folded = seat.status === 'folded'

  return (
    <div
      className={`flex w-24 flex-col items-center lg:w-28 ${
        out ? 'opacity-25' : folded ? 'opacity-40' : ''
      }`}
    >
      {/* Hole cards, drawn over the top edge of the avatar. */}
      <div className="relative z-10 flex h-10 gap-0.5">
        {seat.holeCards !== null &&
          seat.holeCards.map((card, i) => (
            <CardView key={i} card={card} hidden={!revealed} size="sm" />
          ))}
      </div>

      <div className="relative -mt-2 lg:-mt-2.5">
        <Avatar name={seat.name} seatId={seat.id} isHuman={seat.isHuman} isTurn={isTurn} />
        {isButton && (
          <span
            className="absolute top-1/2 -right-2.5 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-900 shadow"
            title="Dealer button"
          >
            D
          </span>
        )}
      </div>

      {/* Name plate, overlapping the bottom edge of the avatar. */}
      <div
        className={`relative z-10 -mt-2 w-full rounded-full border bg-black/75 px-2 py-0.5 text-center lg:-mt-2.5 ${
          isTurn ? 'border-amber-300/70' : 'border-white/10'
        }`}
      >
        <div className="truncate text-[10px] leading-4 font-medium text-white/90 lg:text-[11px]">
          {seat.name}
          {position !== null && <span className="ml-1 text-white/40">{position}</span>}
        </div>
        <div
          className={`text-[11px] leading-4 font-semibold tabular-nums lg:text-xs ${
            out ? 'text-white/60' : 'text-chip-gold'
          }`}
        >
          {out ? 'busted' : formatChips(seat.stack)}
        </div>
      </div>

      {/* Chips and status. Always rendered, so the seat never changes height. */}
      <div className="mt-1 flex h-5 items-center justify-center gap-1">
        {seat.status === 'allin' && <span className={`${PILL} bg-rose-600/80 text-white`}>ALL IN</span>}
        {folded && <span className={`${PILL} bg-black/60 text-white/60`}>FOLDED</span>}
        {won > 0 ? (
          <span className={`${PILL} bg-emerald-600/80 text-white`}>+{formatChips(won)}</span>
        ) : (
          seat.committedThisStreet > 0 && (
            <span className={`${PILL} bg-black/60 text-white/85`}>
              {formatChips(seat.committedThisStreet)}
            </span>
          )
        )}
      </div>
    </div>
  )
}
