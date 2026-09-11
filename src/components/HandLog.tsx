import { useEffect, useRef } from 'react'
import type { GameState } from '../engine/types.ts'
import { describeLogEntry } from '../utils/format.ts'

type Props = { game: GameState }

export default function HandLog({ game }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the newest line in view as the hand plays out.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [game.log.length])

  return (
    <div className="flex h-full flex-col rounded-lg border border-white/10 bg-black/30">
      <h2 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-white/50">
        Hand history
      </h2>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs leading-relaxed text-white/70">
        {game.log.map((entry, index) => (
          <div
            key={index}
            className={
              entry.type === 'hand-start'
                ? 'mt-2 font-semibold text-white/40 first:mt-0'
                : entry.type === 'award' || entry.type === 'fold-win'
                  ? 'text-emerald-300'
                  : entry.type === 'deal'
                    ? 'text-sky-300'
                    : ''
            }
          >
            {describeLogEntry(entry, game.seats)}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
