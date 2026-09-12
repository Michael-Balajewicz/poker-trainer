import type { GameState } from '../engine/types.ts'
import { potSize } from '../engine/hand.ts'
import { formatChips, positionNames, STREET_LABEL } from '../utils/format.ts'
import CardView from './CardView.tsx'
import SeatView from './SeatView.tsx'

type Props = {
  game: GameState
  heroSeat: number
}

/**
 * Seat positions around an oval, in percentages.
 *
 * The hero is pinned to the bottom centre and the rest fan out clockwise, so
 * the seat that acts after you is always the next one to the right on screen.
 */
function seatPosition(seatId: number, heroSeat: number, seatCount: number) {
  const offset = (seatId - heroSeat + seatCount) % seatCount
  const angle = Math.PI / 2 - (offset / seatCount) * 2 * Math.PI
  // Percentages of the seat layer, which is inset by half a seat box. That
  // inset is what keeps a seat centred on the layer's edge from spilling out
  // of the table and giving the whole page a horizontal scrollbar.
  return {
    left: `${50 + 50 * Math.cos(angle)}%`,
    top: `${50 + 50 * Math.sin(angle)}%`,
  }
}

export default function Table({ game, heroSeat }: Props) {
  const positions = positionNames(game.seats, game.buttonIndex)
  const pot = potSize(game)
  const finished = game.result !== null
  // Cards go face up at showdown only. When everyone folds there is no
  // showdown, and nobody's cards are revealed -- same as a real table.
  const showdownSeats = new Set(game.result?.showdown?.map((entry) => entry.seat) ?? [])

  return (
    <div className="relative aspect-16/10 w-full min-h-[400px] lg:min-h-[520px]">
      {/* Felt */}
      <div className="absolute inset-[13%] rounded-[50%] border-[10px] border-rail-800 bg-linear-to-b from-felt-700 to-felt-900 shadow-2xl shadow-black/60 ring-1 ring-black/40" />

      {/* Board and pot */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="text-xs uppercase tracking-widest text-white/40">
          {STREET_LABEL[game.street]}
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <CardView key={i} card={game.board[i] ?? null} size="lg" />
          ))}
        </div>
        <div className="rounded-full bg-black/50 px-4 py-1 text-sm font-semibold tabular-nums text-white/90">
          Pot {formatChips(pot)}
        </div>
      </div>

      {/* Seat layer: inset by half a seat box so nothing overflows the table. */}
      <div className="absolute inset-x-[52px] inset-y-[52px] lg:inset-x-[68px] lg:inset-y-[62px]">
        {game.seats.map((seat) => (
          <div
            key={seat.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={seatPosition(seat.id, heroSeat, game.seats.length)}
          >
            <SeatView
              seat={seat}
              position={positions[seat.id]}
              isButton={seat.id === game.buttonIndex}
              isTurn={game.currentTurn === seat.id}
              revealed={seat.id === heroSeat || showdownSeats.has(seat.id)}
              won={finished ? (game.result?.payouts[seat.id] ?? 0) : 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
