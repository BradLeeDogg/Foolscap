# Review fixtures

Synthetic but realistic `.writeproject` folders for UX review, performance
testing, and persona walkthroughs. Deterministic (seeded PRNG).

## Build

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron fixtures/build-fixtures.cjs
# output: fixtures/out/*.writeproject  (gitignored)
```

Open any generated project from the Foolscap launcher ("Open Project…").

## Contents

| Project | Type | What it exercises |
| --- | --- | --- |
| `Endings` | novel | ~106k words, 60 scenes in 3 acts, POV/Setting/Characters metadata on every scene, mixed status labels. **Scene 12 is ~15,000 words** (typing-latency probe). |
| `The Long Fall` | journalism-long | 6k-word feature, 40 sources (10 captured web pages on disk), 120 claims ≈60/29/11% verified / needs-sourcing / disputed, quote-check flags, 2 interview transcripts (30 segments each). |
| `Council Brief` | journalism-short | 400-word news brief, mid-draft (Kicker still empty). |
| `Dissertation` | dissertation | 5 chapters (~22k words), 200 references with author/container/year, front-matter stubs (ToC, Lists of Figures/Tables). |
| `Proposal` | nonfiction-book | Proposal apparatus (overview, bio, comps, market), 12-chapter annotated TOC, 2 sample chapters (~8k words), Bibliography stub. |

## Notes

- The generator replicates the app's storage format directly (schema
  `user_version = 7`, `meta` keys, `documents/<uuid>.json`). If `db.ts`
  migrations move past 7, update `createSchema` here to match.
- `perf-probe.cjs` measures storage-level costs (project scan, search,
  document parse) against the generated fixtures without launching the UI.
