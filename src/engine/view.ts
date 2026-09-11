// The redaction boundary.
//
// GameState holds the undealt deck and everybody's hole cards, because it is
// effectively the dealer's view. Handing that to a bot would let it read the
// future -- but the worse problem is the coach: given unredacted state it would
// happily compute your equity against villains' ACTUAL cards instead of unknown
// ones. That does not crash. It just makes every number it shows quietly and
// unfalsifiably wrong.
//
// So bots and the coach take a PlayerView, never a GameState. As a bonus this
// is exactly the payload a server would send a client if this ever became real
// multiplayer -- right shape, different location.

import type { Card } from './cards.ts'
import type { GameState, Seat } from './types.ts'

export type PlayerView = Omit<GameState, 'deck' | 'deckIndex'> & { heroSeat: number }

const copyHole = (cards: readonly Card[] | null): [Card, Card] | null =>
  cards === null ? null : [cards[0], cards[1]]

/** State as one seat is allowed to see it: no deck, no other players' cards. */
export function playerView(state: GameState, heroSeat: number): PlayerView {
  const seats: Seat[] = state.seats.map((seat) => ({
    ...seat,
    holeCards: seat.id === heroSeat ? copyHole(seat.holeCards) : null,
  }))

  return {
    seats,
    buttonIndex: state.buttonIndex,
    street: state.street,
    board: [...state.board],
    currentTurn: state.currentTurn,
    betToCall: state.betToCall,
    lastRaiseSize: state.lastRaiseSize,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    handNumber: state.handNumber,
    rngState: state.rngState,
    log: [...state.log],
    result: state.result,
    heroSeat,
  }
}

/** Players still in the hand other than the hero. */
export const liveOpponents = (view: PlayerView): number =>
  view.seats.filter(
    (seat) => seat.id !== view.heroSeat && (seat.status === 'active' || seat.status === 'allin'),
  ).length
