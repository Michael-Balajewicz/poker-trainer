// Side pots.
//
// The classic design maintains an array of pot objects during the hand, and it
// is the number one source of side-pot bugs because every single action has to
// decide which pot it feeds. We do the opposite: track nothing but each seat's
// committedThisHand, and derive the whole pot structure once, at the end.
//
// Everything then falls out with no special cases:
//
//   - Folded players' chips are included (their contributions land in the lower
//     layers) but they are never eligible to win.
//   - Uncalled bets return themselves. Shove 500, get called for 200, and the
//     top layer has only the shover as eligible -- so they win it back.

import type { Pot, Seat } from './types.ts'

const isContender = (seat: Seat): boolean => seat.status === 'active' || seat.status === 'allin'

/**
 * Split the chips into layered pots.
 *
 * Each distinct commitment level among the players still in the hand creates a
 * layer. Every seat contributes to a layer up to the amount they actually put
 * in, and only players who reached that level can win it.
 */
export function buildPots(seats: readonly Seat[]): Pot[] {
  const contenders = seats.filter(isContender)

  // Levels come from contenders, not from every seat. That is safe because the
  // player with the highest commitment can never have folded -- folding
  // requires facing a bet larger than yours, which means someone committed
  // more. So no folded player's chips can sit above the top layer.
  const levels = [...new Set(contenders.map((s) => s.committedThisHand))]
    .filter((level) => level > 0)
    .sort((a, b) => a - b)

  const pots: Pot[] = []
  let previous = 0

  for (const level of levels) {
    let amount = 0
    for (const seat of seats) {
      // How much of this seat's money falls inside the band (previous, level].
      amount +=
        Math.min(seat.committedThisHand, level) - Math.min(seat.committedThisHand, previous)
    }
    if (amount > 0) {
      pots.push({
        amount,
        eligible: contenders.filter((s) => s.committedThisHand >= level).map((s) => s.id),
      })
    }
    previous = level
  }

  // Chip conservation. If this ever fires, chips have been created or destroyed
  // and every downstream number is wrong -- better to fail loudly right here
  // than to let the player quietly end up with the wrong stack.
  const committed = seats.reduce((sum, s) => sum + s.committedThisHand, 0)
  const potted = pots.reduce((sum, p) => sum + p.amount, 0)
  if (potted !== committed) {
    throw new Error(`Pot mismatch: pots total ${potted} but ${committed} chips were committed`)
  }

  return pots
}

/**
 * Seat ids in clockwise order starting left of the button.
 *
 * Used to hand out the odd chip when a pot splits unevenly. Any rule would do,
 * but this is the standard one and, more usefully, it is deterministic -- so it
 * can be tested.
 */
export function orderFromButton(seatCount: number, buttonIndex: number, ids: readonly number[]): number[] {
  const ordered: number[] = []
  for (let i = 1; i <= seatCount; i++) {
    const index = (buttonIndex + i) % seatCount
    if (ids.includes(index)) ordered.push(index)
  }
  return ordered
}

/**
 * Split one pot among its winners, giving odd chips out one at a time starting
 * left of the button. Returns chips won per winner, in the same order as
 * `winners`.
 */
export function splitPot(
  amount: number,
  winners: readonly number[],
  seatCount: number,
  buttonIndex: number,
): { seat: number; amount: number }[] {
  const ordered = orderFromButton(seatCount, buttonIndex, winners)
  const share = Math.floor(amount / ordered.length)
  let remainder = amount - share * ordered.length

  return ordered.map((seat) => {
    let won = share
    if (remainder > 0) {
      won += 1
      remainder -= 1
    }
    return { seat, amount: won }
  })
}
