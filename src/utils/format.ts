import type { Action, LogEntry, Seat } from '../engine/types.ts'
import { formatCard } from '../engine/cards.ts'

export const formatChips = (chips: number): string => chips.toLocaleString('en-US')

/** Chips expressed in big blinds, which is how poker players actually think. */
export const toBigBlinds = (chips: number, bigBlind: number): string => {
  const bb = chips / bigBlind
  return `${bb % 1 === 0 ? bb : bb.toFixed(1)}bb`
}

// Seats are named outward from the small blind. Heads-up is the exception the
// engine already handles: the button posts the small blind, so it is labelled
// as the button rather than as two things at once.
const POSITION_NAMES: Record<number, string[]> = {
  2: ['BTN', 'BB'],
  3: ['SB', 'BB', 'BTN'],
  4: ['SB', 'BB', 'UTG', 'BTN'],
  5: ['SB', 'BB', 'UTG', 'CO', 'BTN'],
  6: ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'],
  7: ['SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO', 'BTN'],
  8: ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
  9: ['SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN'],
}

/**
 * Position label per seat id, or null for a busted seat.
 *
 * Derived rather than stored: it changes every hand as the button moves, and
 * anything derivable should be computed at render time, not kept in state.
 */
export function positionNames(seats: readonly Seat[], buttonIndex: number): (string | null)[] {
  const live = seats.filter((seat) => seat.status !== 'out').map((seat) => seat.id)
  const names = POSITION_NAMES[live.length] ?? POSITION_NAMES[9]
  const labels: (string | null)[] = seats.map(() => null)
  if (live.length < 2) return labels

  const buttonPosition = Math.max(0, live.indexOf(buttonIndex))
  const smallBlind = live.length === 2 ? buttonPosition : (buttonPosition + 1) % live.length

  for (let i = 0; i < live.length; i++) {
    labels[live[(smallBlind + i) % live.length]] = names[i] ?? null
  }
  return labels
}

export function describeAction(action: Action, amount: number): string {
  switch (action.type) {
    case 'fold':
      return 'folds'
    case 'check':
      return 'checks'
    case 'call':
      return `calls ${formatChips(amount)}`
    case 'bet':
      return `bets ${formatChips(action.to)}`
    case 'raise':
      return `raises to ${formatChips(action.to)}`
  }
}

/** One line of hand history. */
export function describeLogEntry(entry: LogEntry, seats: readonly Seat[]): string {
  const name = (id: number) => seats[id]?.name ?? `Seat ${id}`

  switch (entry.type) {
    case 'hand-start':
      return `--- Hand #${entry.handNumber} - button on ${name(entry.button)} ---`
    case 'blind':
      return `${name(entry.seat)} posts the ${entry.blind} blind, ${formatChips(entry.amount)}`
    case 'action':
      return `${name(entry.seat)} ${describeAction(entry.action, entry.amount)}${
        entry.allIn ? ' (all in)' : ''
      }`
    case 'deal':
      return `${entry.street}: ${entry.cards.map(formatCard).join(' ')}`
    case 'showdown':
      return `${name(entry.seat)} shows ${entry.description}`
    case 'award':
      return `${name(entry.seat)} wins ${formatChips(entry.amount)}`
    case 'fold-win':
      return `${name(entry.seat)} wins ${formatChips(entry.amount)} (everyone folded)`
  }
}

export const STREET_LABEL: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
}
