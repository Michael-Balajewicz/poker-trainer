# CLAUDE.md

Guidance for Claude (and any AI assistant) working in this repository.

> This file **replaces** the `CLAUDE.md` in the parent `Downloads/` directory, which
> describes a different project (a Supabase workout tracker). Nothing about Supabase,
> RLS, TanStack Query, or database migrations applies here.

## About This Project

An offline **No-Limit Texas Hold'em trainer**: play 9-handed against bot opponents, with a
**coach** you can consult to check whether a decision was correct.

This is a **learning project** — the developer is learning React, TypeScript, and how a
real rules engine is structured. Optimize for the developer's understanding over speed or
cleverness. A slightly longer path they follow and learn from beats a fast, opaque one.

## Working Principles

### 1. Explain before you change

Before any change, explain it in plain terms: **what** you're changing and where, **why**
it's needed, and **how** it works — especially any React/TypeScript concept involved, since
learning those is the point. Prefer short, concrete descriptions over jargon.

### 2. Follow YAGNI — You Aren't Gonna Need It

Build what the current step needs, nothing more.

- **Solve the problem in front of you.** One use case means code for one use case.
- **Three strikes, then abstract.** Write it plainly; note duplication the second time;
  extract only on the third.
- **No premature abstraction.** No interfaces, registries, or "processor" wrappers for a
  single concrete implementation. A wrong abstraction is harder to undo than duplication.
- **Don't build a plugin system for one plugin.**

**YAGNI does *not* mean:** skip the `engine/` / `bots/` / `coach/` / `components/` layering
(that makes changes cheaper and is worth keeping), skip error handling, or skip the engine
tests — side-pot and min-raise bugs are *silent*, which is exactly why they're tested.

## Tech Stack

- **Build:** Vite 8 + React 19 + TypeScript 6
- **Styling:** Tailwind v4 — **CSS-first**. Config lives in `@theme` inside `src/index.css`.
  There is deliberately **no** `tailwind.config.js` and **no** postcss config.
- **Testing:** Vitest (engine and equity only — no component tests, no jsdom)
- **Linting:** oxlint (not eslint)
- **Runtime dependencies: `react` and `react-dom` only.** No router, no state library, no
  data-fetching library, no backend. Adding a runtime dependency needs a real justification.

## Code Style

Matching the developer's other project: **no semicolons**, single quotes, 2-space indent,
relative imports **with the file extension** (`./types.ts`), default exports for components.

## Compiler Constraints (these bite)

`tsconfig.app.json` sets flags that shape the code:

- **`erasableSyntaxOnly: true` — TS `enum` is illegal.** Use string-literal unions and
  `as const` objects. This is the most common "why won't it build" moment.
- **`verbatimModuleSyntax: true`** — type-only imports must be `import type { X } from ...`.
- **`noUnusedParameters: true`** — prefix intentionally unused args with `_`.
- **`strict: true`** — deliberately on (the other project has it off). This engine is full of
  honestly-nullable values (`currentTurn: number | null`); without it those types are lies.

## Architecture

**`engine/`, `bots/`, and `coach/` are pure TypeScript with zero React.** Only `components/`
and `App.tsx` know React exists. That is what makes the rules testable, the coach swappable,
and a future server-side move possible.

Dependencies flow one way: `bots/ → engine/` and `coach/ → engine/`.
**`bots/` and `coach/` must never import each other** — bots stay fast and dumb; the coach is
allowed to be slow and careful.

```
src/
├── engine/      # NLHE rules: cards, evaluator, betting state machine, side pots
├── bots/        # opponent decisions (rule-based, never runs Monte Carlo)
├── coach/       # decision evaluation: preflop charts + Monte Carlo equity
├── components/  # React UI
└── utils/       # formatting helpers
```

## Invariants — do not break these

- **`GameState` must stay JSON-serializable.** No `Map`, `Set`, class, function, or `Date`.
  This is what makes hand history, a Web Worker, and a future server all free.
- **Chips are integers everywhere.** Never let a float into the money path; round at the UI
  boundary before building an `Action`.
- **Bet amounts are always raise-TO, never raise-BY.** Most poker engine bugs trace to this.
- **The coach must never see opponents' hole cards.** It consumes a redacted `PlayerView`.
  Violating this doesn't crash — it silently makes every number the coach shows wrong.
- **Chip conservation:** total chips in play is invariant after every action.

## The Coach Is Not a Solver

It judges decisions on raw equity and pot odds. It samples *random* opponent hands (so its
equity reads high), assumes the hand checks down after the current action, and uses a guessed
fold-equity number. These limits are listed in `components/CoachLimitations.tsx` and shown in
the UI on purpose — **keep that panel honest as the logic improves.**

## For Anything Ambiguous

If a request is unclear, the scope could balloon, or a choice adds complexity beyond the
current step, pause and ask — then explain the trade-offs simply so the developer can decide.
