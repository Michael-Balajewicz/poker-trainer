# Poker Trainer

Play offline 9-handed No-Limit Texas Hold'em against bot opponents, with a **coach** you can
consult to check whether a decision was correct.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

> **Note:** opening a built `dist/index.html` by double-clicking will *not* work. Vite emits
> `<script type="module">`, and browsers block ES modules over `file://`. Use `npm run dev` or
> `npm run preview`. If you ever want a single double-clickable file to send someone,
> `vite-plugin-singlefile` inlines everything into one HTML.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the engine, evaluator and coach tests once |
| `npm run test:watch` | Same, in watch mode |
| `npm run lint` | oxlint |

## What it does

- Full No-Limit Hold'em: blinds, all four streets, min-raise rules, all-ins, **side pots**,
  showdown with correct kicker and split-pot handling
- Eight bot opponents in two personalities (tight-aggressive and loose-passive)
- A coach with two modes, toggled in its panel:
  - **Review** — act first, then press "How did I do?" for a rating and the reasoning
  - **Hint** — see the recommendation *before* you act
- Hand history, adjustable bot speed, and chip stacks that carry across hands

## How it's put together

`engine/`, `bots/` and `coach/` are pure TypeScript with no React, so the rules are testable on
their own and the coach can be improved without touching the UI.

```
src/
├── engine/      # cards, hand evaluator, betting state machine, side pots
├── bots/        # opponent decision logic
├── coach/       # preflop charts + Monte Carlo equity
├── components/  # React UI
└── utils/       # formatting helpers
```

Dependencies flow one way: `bots/ → engine/` and `coach/ → engine/`. Bots and the coach never
import each other — bots stay fast and dumb, the coach is allowed to be slow and careful. Both
receive a redacted `PlayerView` rather than the full state, so neither can see opponents' cards.

Runtime dependencies are `react` and `react-dom`. That is the whole list.

## About the coach

It is **not** a solver. It judges decisions on raw equity and pot odds: preflop it looks up a
positional range chart, postflop it runs a Monte Carlo simulation and compares your equity against
the pot odds you're being offered, ranking each candidate action by expected value.

Its known limits — random opponent hands rather than realistic ranges, no future-street planning,
a guessed fold-equity number — are listed in the app itself under "What this coach does not do",
so you can trust the numbers exactly as much as they deserve.

Improving it means rewriting behind two function signatures in `src/coach/coach.ts`:

```ts
getAdvice(view)            // what to do
judgeAction(view, action)  // how your decision scored
```

Nothing in the UI needs to change. The cheapest real improvement is sampling opponent hands from a
realistic range instead of uniformly at random, which currently biases the displayed equity high.

## Tests

97 tests covering the parts where being wrong is *silent*:

- The hand evaluator is differential-tested against a deliberately naive 21-subset oracle over
  10,000 random hands
- Property tests play hundreds of random hands asserting chip conservation after **every** action,
  and that no card is ever dealt twice
- Side pots, min-raise rules, and the case where an all-in for less than a full raise must not
  reopen betting
- Equity is checked against published all-in numbers (aces 85% heads-up, 31% nine-handed)

## Known gaps

- **Small screens are untested.** The layout has narrow-screen sizing but a nine-seat table is
  cramped on a phone, and it has not been verified on real hardware.
- Settings (blinds, stack size, speed) reset on reload — no persistence yet.

## Deploying

It's a static site with no backend. `npm run build` produces `dist/`, which can be dropped on
Netlify or deployed from this repo via Vercel. No environment variables required.
