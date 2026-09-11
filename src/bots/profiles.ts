// Bot personalities.
//
// Plain config objects, deliberately: no factory, no registry, no interface.
// There are two concrete bots and no requirement for a third, so a data table
// is the whole abstraction that is warranted.

export type BotProfile = {
  name: string
  /** Minimum Chen score to enter a pot. Higher = folds more preflop. */
  chenThreshold: number
  /** 0..1. How often a strong hand raises rather than just calling. */
  aggression: number
  /** 0..1. How often it bets with nothing. */
  bluffFrequency: number
  /** Extra equity slack when calling. Higher = calls too wide. */
  callTolerance: number
}

export const TIGHT_AGGRESSIVE: BotProfile = {
  name: 'Tight-aggressive',
  chenThreshold: 9,
  aggression: 0.65,
  bluffFrequency: 0.12,
  callTolerance: 0.02,
}

export const LOOSE_PASSIVE: BotProfile = {
  name: 'Loose-passive',
  chenThreshold: 5,
  aggression: 0.2,
  bluffFrequency: 0.05,
  callTolerance: 0.12,
}

export const PROFILES: BotProfile[] = [TIGHT_AGGRESSIVE, LOOSE_PASSIVE]

/**
 * Which personality sits in which seat. Deterministic, so a given seat always
 * plays the same way and you can learn to read it -- which is the point of a
 * trainer.
 */
export const profileForSeat = (seatId: number): BotProfile => PROFILES[seatId % PROFILES.length]
