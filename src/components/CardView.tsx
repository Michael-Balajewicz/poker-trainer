import type { Card } from '../engine/cards.ts'
import { RANKS, rankOf, suitOf } from '../engine/cards.ts'

// Suit order matches the card encoding: clubs, diamonds, hearts, spades.
const SUIT_SYMBOL = ['♣', '♦', '♥', '♠']
const SUIT_IS_RED = [false, true, true, false]

type Props = {
  card: Card | null
  /** Face down: we know a card is there, but not which one. */
  hidden?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: 'w-7 h-10 text-sm rounded',
  md: 'w-10 h-14 text-lg rounded-md',
  lg: 'w-14 h-20 text-2xl rounded-lg',
}

export default function CardView({ card, hidden = false, size = 'md' }: Props) {
  const box = SIZES[size]

  if (card === null) {
    return <div className={`${box} border border-white/10 bg-white/5`} aria-hidden />
  }

  if (hidden) {
    return (
      <div
        className={`${box} border border-sky-300/30 bg-linear-to-br from-sky-800 to-sky-950 shadow`}
        aria-label="Face-down card"
      />
    )
  }

  const rank = RANKS[rankOf(card)]
  const suit = suitOf(card)

  return (
    <div
      className={`${box} flex flex-col items-center justify-center bg-white font-semibold leading-none shadow ${
        SUIT_IS_RED[suit] ? 'text-rose-600' : 'text-slate-900'
      }`}
      aria-label={`${rank}${SUIT_SYMBOL[suit]}`}
    >
      <span>{rank}</span>
      <span className="text-[0.8em]">{SUIT_SYMBOL[suit]}</span>
    </div>
  )
}
