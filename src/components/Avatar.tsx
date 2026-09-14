// Seat avatars.
//
// Pictures are picked up automatically from src/assets/avatars/. Name a file
// after the player it belongs to -- ava.png, ben.jpg -- and it appears at that
// seat. There is no list to keep in sync, and nothing breaks when a picture is
// missing: the seat just shows a placeholder instead.

// import.meta.glob is a Vite feature rather than standard JavaScript. When the
// app is built, Vite finds every file matching the pattern and writes the
// imports for us, turning the folder into an object of { path: url }.
const pictures = import.meta.glob<string>(
  '../assets/avatars/*.{png,jpg,jpeg,webp,gif,svg,avif}',
  { eager: true, query: '?url', import: 'default' },
)

// Re-keyed by lower-case file name without its extension, so pictures can be
// looked up by player: '../assets/avatars/Ava.png' becomes 'ava'.
const pictureByName: Partial<Record<string, string>> = {}
for (const [path, url] of Object.entries(pictures)) {
  const file = path.slice(path.lastIndexOf('/') + 1)
  pictureByName[file.slice(0, file.lastIndexOf('.')).toLowerCase()] = url
}

// Placeholder backgrounds until real pictures exist -- one per seat, so the
// seats are easy to tell apart at a glance.
const PLACEHOLDER_COLOURS = [
  'bg-emerald-600',
  'bg-sky-700',
  'bg-violet-700',
  'bg-rose-700',
  'bg-teal-700',
  'bg-indigo-700',
  'bg-fuchsia-700',
  'bg-cyan-700',
  'bg-pink-700',
]

type Props = {
  name: string
  seatId: number
  isHuman: boolean
  isTurn: boolean
}

export default function Avatar({ name, seatId, isHuman, isTurn }: Props) {
  const picture = pictureByName[name.toLowerCase()]
  const background =
    picture === undefined
      ? PLACEHOLDER_COLOURS[seatId % PLACEHOLDER_COLOURS.length]
      : 'bg-black/40'

  return (
    <div
      className={`grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 transition-shadow lg:h-14 lg:w-14 ${background} ${
        isTurn ? 'border-amber-300 ring-4 ring-amber-300/30' : 'border-white/25'
      }`}
    >
      {picture === undefined ? (
        <span className="text-sm font-semibold text-white lg:text-base">
          {isHuman ? 'You' : name.charAt(0).toUpperCase()}
        </span>
      ) : (
        // object-cover crops a picture of any shape to fill the circle, instead
        // of squashing it.
        <img src={picture} alt="" draggable={false} className="h-full w-full object-cover" />
      )}
    </div>
  )
}
