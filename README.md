# Poker Trainer

Play offline 9-handed No-Limit Texas Hold'em against bot opponents, with a **coach** you can
consult to check whether a decision was correct.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

> **Note:** opening a built `dist/index.html` directly by double-clicking will *not* work.
> Vite emits `<script type="module">`, and browsers block ES modules over `file://`. Use
> `npm run dev` or `npm run preview`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Run the engine, evaluator, and equity tests once |
| `npm run test:watch` | Same, in watch mode |
| `npm run lint` | oxlint |

## How it's put together

`engine/`, `bots/`, and `coach/` are pure TypeScript with no React — the rules are testable
on their own, and the coach can be improved without touching the UI.

```
src/
├── engine/      # cards, hand evaluator, betting state machine, side pots
├── bots/        # opponent decision logic
├── coach/       # preflop charts + Monte Carlo equity
├── components/  # React UI
└── utils/       # formatting helpers
```

## About the coach

It is **not** a solver. It judges decisions on raw equity and pot odds: preflop it uses a
positional range chart, postflop it runs a Monte Carlo simulation and compares your equity
against the pot odds you're being offered.

Its known limits — random opponent hands rather than realistic ranges, no future-street
planning, a guessed fold-equity number — are listed in the app itself, so you can trust the
numbers exactly as much as they deserve.

## Deploying

It's a static site with no backend. `npm run build` produces `dist/`, which can be dropped
on Netlify or deployed from this repo via Vercel. No environment variables required.
