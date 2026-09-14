import type { GameState } from '../engine/types.ts'
import { potSize } from '../engine/hand.ts'
import { formatChips, positionNames, STREET_LABEL } from '../utils/format.ts'
import CardView from './CardView.tsx'
import SeatView from './SeatView.tsx'

type Props = {
  game: GameState
  heroSeat: number
}

// The table is a "stadium": two straight sides joined by semicircular ends,
// which is the shape of a real poker table. The seats sit on a rail of that
// shape.
//
// The rail is measured in units where its height is 1. It is TABLE_ASPECT units
// wide, and each rounded end is a semicircle of radius 0.5.
const TABLE_ASPECT = 2
const RADIUS = 0.5
const STRAIGHT = TABLE_ASPECT - 2 * RADIUS // length of the top and bottom edges
const CURVE = Math.PI * RADIUS // length of each rounded end
const PERIMETER = 2 * STRAIGHT + 2 * CURVE
const CENTRE_X = TABLE_ASPECT / 2

/**
 * The point `distance` units around the rail, starting from bottom centre.
 *
 * It walks the rail one segment at a time -- bottom edge, left end, top edge,
 * right end, then back along the bottom -- taking away each segment's length
 * until the distance left over lands inside one.
 */
function pointOnRail(distance: number): { x: number; y: number } {
  const halfStraight = STRAIGHT / 2
  let remaining = distance

  // Bottom edge, heading left.
  if (remaining < halfStraight) return { x: CENTRE_X - remaining, y: 1 }
  remaining -= halfStraight

  // Left end, curving upwards. Distance along an arc divided by its radius is
  // the angle swept so far, in radians.
  if (remaining < CURVE) {
    const angle = remaining / RADIUS
    return {
      x: CENTRE_X - halfStraight - RADIUS * Math.sin(angle),
      y: RADIUS + RADIUS * Math.cos(angle),
    }
  }
  remaining -= CURVE

  // Top edge, heading right.
  if (remaining < STRAIGHT) return { x: CENTRE_X - halfStraight + remaining, y: 0 }
  remaining -= STRAIGHT

  // Right end, curving downwards.
  if (remaining < CURVE) {
    const angle = remaining / RADIUS
    return {
      x: CENTRE_X + halfStraight + RADIUS * Math.sin(angle),
      y: RADIUS - RADIUS * Math.cos(angle),
    }
  }
  remaining -= CURVE

  // Bottom edge again, heading left back towards the start.
  return { x: CENTRE_X + halfStraight - remaining, y: 1 }
}

/**
 * Where a seat sits, as percentages of the rail's box.
 *
 * Seats are spaced by equal distance around the rail rather than by equal
 * angle, so the gaps between neighbours are even along the straight sides and
 * around the curves alike.
 *
 * The hero is pinned to bottom centre and the other seats follow clockwise --
 * which on screen means heading left first. That matches a real table: the
 * action passes to your left, so the player who acts after you sits on your
 * left.
 */
function seatPosition(seatId: number, heroSeat: number, seatCount: number) {
  const offset = (seatId - heroSeat + seatCount) % seatCount
  const { x, y } = pointOnRail((offset / seatCount) * PERIMETER)
  return {
    left: `${(x / TABLE_ASPECT) * 100}%`,
    top: `${y * 100}%`,
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
    // Padding of half a seat box on every side. Seats are centred on the rail,
    // so without it the outermost seats would spill past the table area and
    // give the whole page a horizontal scrollbar.
    <div className="px-12 py-[52px] lg:px-16 lg:py-[60px]">
      {/* The rail's box. Its aspect ratio comes from the same constant as the
          seat maths, so the two can never drift apart -- and because the ratio
          is fixed, the rounded ends stay true semicircles at any width. */}
      <div className="relative w-full" style={{ aspectRatio: TABLE_ASPECT }}>
        {/* Felt and rail: the same stadium, pulled in from where the seats sit.
            rounded-full on a wide box is exactly that shape. */}
        <div className="absolute inset-11 rounded-full border-[10px] border-rail-800 bg-linear-to-b from-felt-700 to-felt-900 shadow-2xl shadow-black/60 ring-1 ring-black/40" />

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
