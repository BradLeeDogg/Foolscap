# Foolscap — Full UX & Persona Audit: Findings

*Review session, 2026-07-02. No application code was changed; `/fixtures` scripts were added (allowed exception).*

**Method & honesty statement.** There is no `SPEC.md` in the repo — `PLAN.md` (+ `README.md`) is the de-facto spec and was used as the ethos yardstick; that absence is itself Finding F-01. The app was exercised headless (xvfb): boot + panel-mount smoke passed against the current build. Storage-level performance was **measured** against generated fixtures (`fixtures/build-fixtures.cjs`, five realistic projects incl. a 106k-word novel with a 15,000-word scene). Interaction-level behavior (typing feel, drag, sound, menus) cannot be experienced headless; those paths were **code-traced** and every unverifiable claim is listed in the Manual Test List at the end. Fixture numbers quoted below come from `fixtures/perf-probe.cjs` and a transpiled benchmark of `src/shared/proofreader.ts`.

---

## What's genuinely good — protect this

These are specific, load-bearing decisions. Future "improvements" should not touch them.

1. **The storage architecture is trustworthy and fast.** One file per document, atomic writes (`atomic.ts` temp+rename), WAL + `synchronous=FULL` (`db.ts:14-16`), automatic zip backups excluding `backups/**`, and snapshot-before-replace in project-wide replace (`search.ts:49`). Measured: binder list of the 106k-word novel = **0.6ms**; full-project text search = **11ms**. The "an FTS index can come later" comment in `search.ts:74` is correct — it can. Do not add a search index, a background daemon, or a sync layer.
2. **Scrivenings virtualization** (`Scrivenings.tsx`): only near-viewport sections mount, placeholders preserve scroll height, word counts seeded from cache. This is exactly how a book-length stitched view stays fast. Protect it from "simplify by mounting everything."
3. **Compile is genuinely non-destructive** and preset-driven; presets default correctly by project type (`defaultPresetFor`). The Works Cited generated from real Sources (with hanging indent, per-style headings) is the correct architecture — presentation stays an output step.
4. **The launcher is calm and correct.** Two verbs (New/Open), recents with remove, a welcome block only when empty. `"Nothing between you and the page"` is honored *here*.
5. **Command palette + Quick Open exist and are keyboard-first** (Ctrl+K / Ctrl+P), with shortcut hints mirroring the menu. This is the discoverability spine — several findings below are "route it through the palette," not "add chrome."
6. **Empty states teach** ("Add documents in the binder to see them stitched together here"), and the first-run Help sheet auto-opens once. Copy quality is above genre norm.
7. **Monochrome theme discipline.** Two palettes, CSS-variable driven, no accent creep. (Contrast bugs in F-19 are fixable within the palette.)
8. **Fact-check auto-opens for journalism projects only** (`Workspace.tsx:63`) — the right kind of per-genre defaulting.

---

## Top 10 most consequential findings (ranked)

| # | Finding | Severity |
|---|---------|----------|
| 1 | F-02 Pending autosave is lost on project close / app quit | **Blocker** |
| 2 | F-03 Save failures are invisible (and swallowed entirely in stitched view) | **Blocker** |
| 3 | F-04 No undo for any structural or metadata operation | Major |
| 4 | F-05 Corkboard no longer reorders the binder (spec regression) | Major |
| 5 | F-06 Full-document proofread runs on every keystroke (~11–13ms JS at 15k words) | Major |
| 6 | F-07 Backups exist but are invisible — no list/restore UI | Major |
| 7 | F-08 Collections can't filter on the metadata the app itself seeds (POV etc.) | Major |
| 8 | F-09 Keyboard-first has holes: panels unshortcutted, Esc doesn't close them, Ctrl+S is dead | Major |
| 9 | F-10 Eleven stackable side panels behind 16 top-bar buttons — chrome contradicts the ethos | Major |
| 10 | F-11 No "where was I": reopen lands on first document, not last position | Major |

---

## Part 1 — UX professional audit

### F-01 · No SPEC.md; README promises drift from PLAN
**Severity:** Minor · **Files:** repo root, `PLAN.md`, `README.md`
PLAN.md marks screenplay/track-changes/transcripts as "M6+ — explicitly out of v1," yet all three shipped (README advertises them; `screenplay.ts`, `trackchanges.ts`, `TranscriptsPanel.tsx` exist). Good news, but the governing document no longer describes the product, so "judge against what the app is trying to be" has no stable referent. **Repro:** `ls SPEC.md` → absent; diff PLAN M6+ vs README features.

### F-02 · Pending autosave is lost on project close and on quit
**Severity:** **Blocker** (violates "Data safety is non-negotiable") · **Files:** `Workspace.tsx:158-161`, `DocumentEditor.tsx:360-364`, `main/index.ts:275`, `ipc/index.ts (document:write → requireCurrent)`
Autosave debounces 800ms (`autosaveDebounceMs`). Close paths don't flush it:
- **Close project:** `handleClose` awaits `project.close()` (DB closed), *then* unmounts the workspace; `DocumentEditor`'s cleanup runs `if (dirtyRef.current) void save()` — a fire-and-forget write that now throws `'No project is open'` and is swallowed by `save()`'s catch. Last ≤800ms of typing (plus any in-flight write) is gone, silently.
- **Quit:** native menu uses `role: 'quit'`; `before-quit` checkpoints and closes the DB without asking the renderer to flush. No `beforeunload`/flush handshake exists anywhere (`grep beforeunload` → none).
**Repro:** type in a scene, within 800ms click "‹ Projects" (or Ctrl+Q); reopen → last words absent. **Fix shape:** a `flushAll()` renderer→main handshake before close/quit; `close-requested` intercept; then close. (The store already has `flushActive` — it's only wired to project-replace.)

### F-03 · Save failures are invisible; in stitched view, swallowed entirely
**Severity:** **Blocker** (trust) · **Files:** `DocumentEditor.tsx:328-331`, `Workspace.tsx:26-37,214`
`save()` catch → `if (active) setSaveState('error')` → the word "Save failed" in 12px topbar text. No toast, no retry, no "your work is not on disk" escalation, no queue — and the debounce keeps re-arming, failing again silently. Worse: Scrivenings/split sections run editors with `active=false`, so *their* failures update nothing at all. A full disk or a permissions change (the classic OneDrive/AV lock the README itself warns about) degrades to quiet data loss. **Repro (manual list):** `chmod -w documents/` mid-typing; observe only the small label (single view) or nothing (stitched).

### F-04 · No undo for structural or metadata operations
**Severity:** Major (ethos: "nothing is ever more than a keystroke from recovery") · **Files:** `main/index.ts:25-40` (Edit menu = native roles only), `Binder.tsx`, `Corkboard.tsx`, `Outliner.tsx`, `Inspector.tsx`
Undo/redo exist only inside a focused text field (ProseMirror/native). Binder drag-move, rename, corkboard reposition/resize, outliner inline edits, synopsis/notes edits, label/status changes, claim edits, metadata-field deletion (which destroys values project-wide behind one `window.confirm`) — none are undoable. Trash covers deletion only. A mis-drop of Act II into Act I must be manually re-dragged; a fumbled rename is simply gone. **Compounding:** the editor is remounted per selection (`key={selected.id}`, `Editor.tsx`), so even *text* undo history evaporates every time the writer glances at another document and returns.

### F-05 · Corkboard no longer writes order back to the binder — spec regression
**Severity:** Major · **Files:** `Corkboard.tsx` (current), `PLAN.md M3` ("Corkboard … drag reorders binder")
The recent freeform rewrite (positions/sizes persisted via `corkboard:setRect`) removed the reorder semantics entirely — there is no `binder.move` call left in the component. Card position is now pure decoration; the binder, scrivenings, and **compile order** ignore it. A novelist who "restructures act two on the corkboard" has changed nothing and will discover that at compile time. Freeform placement is a fine *addition*; silently dropping ordered mode is a drift-from-spec finding. (Also: new cards spawn at index-derived grid slots that can overlap freely-moved cards; no tidy/re-flow affordance.)

### F-06 · Whole-document proofread on every keystroke — measured
**Severity:** Major (typing latency = the product) · **Files:** `editor/proofreader.ts:76-99` (`apply: … tr.docChanged → compute(tr.doc)`), `shared/proofreader.ts`, `DocumentEditor.tsx:244 (pushProof per update)`
`compute()` re-walks **every textblock of the whole document** and re-runs all regex rules on each keystroke, even with the Proofreader panel closed; there is no debounce, no changed-range incrementality, and `pushProof()` additionally re-extracts the issue list per update. **Measured** on the fixture's 15,000-word scene: one full pass = **11–13ms** in plain V8 — before ProseMirror decoration rebuild, React, and CharacterCount's own full-text pass. That consumes most of a 16ms frame on a fast machine; on a mid-range laptop, sustained typing in a long chapter will stutter. At 1,500-word scenes it's ~1ms (fine) — the cost curve punishes exactly the writers the app courts. **Repro:** fixtures `Endings` → Scene 12 → type at speed (manual list); benchmark: transpile `shared/proofreader.ts`, run over Scene 12's 273 paragraphs.

### F-07 · Backups are created but invisible
**Severity:** Major (trust) · **Files:** `preload/index.ts:68` (`backup.list` exposed, unused), `SettingsDialog.tsx`, `backups.ts`
Interval zips work (measured fixture backup dir populates on schedule per code path) and "Back up now" exists — but no surface lists backups, shows the last backup time, or restores one. `backup:list` IPC is wired and dead. Recovery = the writer spelunking `backups/` in Explorer and unzipping by hand, which they will first attempt on the worst day of their writing life. The snapshot system (per-document, with diff + confirm-restore, `SnapshotsPanel.tsx`) shows the team knows how to do this; whole-project backups deserve the same one panel.

### F-08 · Collections can't use the app's own metadata
**Severity:** Major · **Files:** `shared/types.ts (CollectionCriteria = text/labelId/statusId)`, `FindPanel.tsx`, `search.ts:76-115`
The app seeds POV/Setting/Characters fields for fiction (`project.ts:188-194`) and the Inspector edits them — but search/collections filter only on label/status/full-text. "Every scene where POV = Mara" (the flagship Scrivener-style review flow, and this review's scripted persona task) is impossible except by full-text searching "Mara", which also matches every scene she merely appears in. The Outliner likewise shows no metadata columns. Metadata is collected but nowhere queryable — a promise the UI makes and the data layer doesn't keep.

### F-09 · Keyboard-first has real holes
**Severity:** Major (ethos: minimalism without discoverability is hidden UI) · **Files:** `main/index.ts` menu, `CommandPalette.tsx`, `Workspace.tsx`, `HelpDialog.tsx`
Good spine (palette, quick-open, view shortcuts, help sheet). Holes:
- **No shortcut toggles any side panel** (Inspector, Sources, Fact-check, Snapshots, Targets, Proofread, Analysis) — mouse-only via top bar or two-step via palette.
- **Escape does not close panels** — each needs its × button (grep: no Esc handling outside modals/composition).
- **Ctrl+S does nothing.** Every writer alive hits it. It should acknowledge ("Saved ✓" flash) or take a snapshot; a dead chord erodes trust in autosave instead of reinforcing it.
- **F2 renames in the binder but is documented nowhere** (not in HelpDialog SHORTCUTS, not in the palette).
- Split view has a menu accelerator (Ctrl+\) but composition's Ctrl+Shift+Return, the theme toggle, and "Back up now" are palette/menu-only; fine — but the Help sheet lists only 7 shortcuts total, so even the ones that exist go undiscovered.

### F-10 · Sixteen top-bar buttons, eleven stackable panels
**Severity:** Major (ethos) · **Files:** `Workspace.tsx:200-262` (topbar), `:266-363` (PanelGroup)
The "calm, unbusy" app greets every writer — including the short-story minimalist — with a permanent strip: Find, Go to, Split, Compose, Corkboard, Inspector, Sources, Fact-check, Transcripts, Proofread, Targets, Snapshots, Back up now, ⚙, Compile (+ ‹ Projects). All panels are independent toggles that **stack simultaneously**: opening five squeezes the editor to its 25% minimum. Nothing enforces "one clear job per surface." The IA underneath is actually sound (binder=structure, inspector=item detail, sources=research, fact-check=claims); the presentation buries it. This is the single largest divergence between the stated ethos and the shipped chrome. (Related: `AnalysisPanel` is reachable only via palette — inconsistent in the other direction.)

### F-11 · No session restore / "where was I"
**Severity:** Major (returning-writer persona) · **Files:** `useStore.ts:120-127` (`selectedId: firstDocument(result.tree)`)
Reopening a project always selects the first document in the tree — for the novel fixture, Scene 1, forever. No last-selection persistence (the DB's `meta` table is right there), no recently-edited list, no visual "edited yesterday" cue in the binder (updatedAt is stored but unused in UI). After three weeks away the writer reorients by scrolling 60 scenes or remembering a title for Quick Open. Targets add guilt to the wound: an expired deadline renders "0 days left" with no per-day figure and no gentle "deadline passed — adjust?" (`TargetsPanel.tsx:44-52,99-104`).

### F-12 · Compile dialog: no fact-check gate, no post-export affordance, one-size fields
**Severity:** Major (journalist trust at 5:55pm) · **Files:** `CompileDialog.tsx`, `ipc/index.ts:530-537`
- Export doesn't surface outstanding claims. "Export fact-check packet alongside" defaults on for journalism, but nothing says **"3 claims still needs-sourcing / 1 disputed"** at the moment of export — the one moment it matters. The data is one query away (`factcheck.outstanding`).
- After export, status shows a file path as text. No "Open" / "Reveal in folder" — at deadline the writer re-navigates Explorer by hand. Same for PDF/ePub.
- The dialog shows manuscript-novel fields (Scene break, Running-header keyword, Contact block) to a journalist compiling a 400-word brief; presets already know these are irrelevant (`journalism: titlePage:false, runningHeader:false, sceneBreak:''`) yet the fields render regardless.

### F-13 · Fact-check panel doesn't scale to a real feature
**Severity:** Major (feature-writer persona) · **Files:** `FactCheckPanel.tsx:120-169`
120 claims across 6 docs, 40 sources (fixture `The Long Fall`): claims are listed per-selected-document with no status filter, no sort, no "show only needs-sourcing here"; the *global* list shows only outstanding. Linking a source = a native `<select>` of all 40 unsorted sources — per claim. Working the list "needs-sourcing → verified" means: select doc → scroll claim → dropdown-hunt → repeat ×35. No claim→text anchor exists either (claims are free-floating strings, never located in the prose), so the checker can't jump from claim to the sentence it supports. The packet (F-14) inherits that.

### F-14 · Fact-check packet is serviceable but is a dump, not a briefing
**Severity:** Minor · **Files:** `ipc/index.ts:53-68`
Plain text, grouped by document, `[status, CHECK VS AUDIO]` per claim, sources with URL/locator, `(no source linked)` marker — genuinely usable for back-checking. Missing for the receiving checker: a header (project, byline, export date), summary counts (verified/needs/disputed), an **outstanding-first section**, and source notes/author fields that the DB already holds. One function, no new UI.

### F-15 · DOCX import silently drops footnotes (and all images)
**Severity:** Major (nonfiction persona; honesty) · **Files:** `importer.ts:26-80`, mammoth default config
`blocksFrom` maps p/h1-6/blockquote/lists and B/I/U marks — verified. There is no `footnote` handling; mammoth's footnote HTML is flattened or lost, images aren't mapped, and **no import summary tells the writer**. The Scrivener import documents its lossiness in PLAN; DOCX import claims no limits anywhere. An author importing a footnoted chapter must diff by hand to learn the truth. Minimum honest fix: post-import report ("Imported 42 paragraphs, 3 headings · dropped: 17 footnotes, 2 images").

### F-16 · Dissertation front matter promises what compile doesn't do
**Severity:** Major (academic persona; honesty) · **Files:** `templates.ts` (`'Table of Contents', synopsis: 'Generated at compile.'`), `compile.ts` (no ToC/LoF/LoT generation)
The dissertation/thesis templates seed "Table of Contents — *Generated at compile*", "List of Figures", "List of Tables". Compile generates none of these; the stubs export as empty pages. Either generate a ToC from `heading`/chapter entries at compile (feasible: entries are known) or change the copy to say "fill in / delete before compile." As shipped, it quietly pretends.
On the positive side of the same honesty ledger: **200 references perform fine** (bibliography build is ms-level; measured DB ops trivial) and the sources model doesn't masquerade as Zotero — kinds/locators/citation fields are labeled plainly. "Simple tracked sources" is honest *except* the front-matter copy. But see F-17.

### F-17 · A 200-reference library outgrows the Sources panel
**Severity:** Minor (academic persona) · **Files:** `SourcesPanel.tsx`
No search/filter box, no kind or year sort; one flat list. At 40 sources (feature fixture) it's tolerable; at 200 (dissertation fixture) finding one reference is scroll-archaeology, and every claim-link dropdown (F-13) inherits all 200 unsorted.

### F-18 · Failure states: import/compile errors are handled; capture errors vary
**Severity:** Minor · **Files:** `Binder.tsx:124-146` (alerts on import failure — good), `CompileDialog.tsx:84-135` (status line shows error message — good), `Launcher.tsx:38-48` (create/open errors shown — good)
Genuine praise: the big three (open, import, compile) fail loudly with messages. Gaps: compile error text can be a raw exception (`e.message` from deep in docx lib); autosave failure (F-03) is the outlier that matters.

### F-19 · Accessibility: keyboard focus is invisible on every button
**Severity:** Major · **Files:** `styles/global.css:66-80` (button base: `border: 1px solid transparent`, no `:focus-visible` rule; only inputs/selects get focus styles at :114), contrast values measured
- **No visible focus indicator on buttons** — the entire top bar, panel headers, dialogs, cards are untabbable in practice. One `aria-label` exists in the whole renderer (`Binder.tsx:292`); icon-only buttons (×, ⚙, ⤓, ⇲, ↗, swatches) rely on `title` alone.
- **Contrast (measured):** ink `14.9:1` ✓, ink-soft `4.98:1` ✓, **ink-faint `2.64:1` ✗ (AA fail)** on paper — used for hints, paths, placeholders; dark theme: soft `7.86` ✓, faint `4.25` ✓ (borderline for small text). The light theme's faint tier needs one variable change.
- **Drag-only reordering** (binder, corkboard, outliner) has no keyboard alternative except binder Alt+↑/↓ (exists! `Binder.tsx:200-206` — good, and undocumented, see F-09).
- **No UI zoom**: View menu lacks zoom roles; UI font fixed 14px. Manuscript font size is settable (good) but chrome/panels are not scalable. Composition mode at accessibility sizes: untested (manual list).

### F-20 · Platform conventions: mostly right, two gaps
**Severity:** Minor · **Files:** `main/index.ts`
Native menu with correct roles (macOS close vs quit split, Edit roles, F11-less fullscreen via composition). Gaps: no `Ctrl+W` close-project vs window ambiguity handling (role close = window close → F-02 path), no recent-projects submenu in File (launcher-only), no zoom roles (F-19). Quit-with-unsaved-state: *should* be a non-issue by design; F-02 means it currently isn't.

### F-21 · Window-prompt ergonomics
**Severity:** Polish · **Files:** `FindPanel.tsx:50` (`window.prompt` collection name), `Corkboard` notes via prompt, `window.confirm` variance (claim delete: no confirm; metadata-field delete: confirm; trash: confirm)
Native prompts are keyboard-hostile (can't be styled, break flow, look alien) and the confirm policy is inconsistent — destructive weight should decide, uniformly.

### F-22 · Performance elsewhere — measured green
**Severity:** Praise/evidence · **Numbers:** binder list 66 items = 0.6ms; full-text search over 106k words = **11ms** (819 hits); slowest single-doc parse (15k words) = 5ms; dissertation search 5ms; storage scales fine ×10. Outliner renders a flat subtree via TanStack (60 rows trivial). The only measured red flag is F-06. Renderer-side long-doc typing remains manual-list.

---

## Part 2 — Persona walkthroughs

*(Fixtures: `fixtures/out/*.writeproject`. Steps were walked through the real UI structure in code; interaction counts are exact per the component flow. Physical execution of clicks was not possible headless — flagged per item in the manual list.)*

### P1 · Deadline news journalist — `Council Brief` (400 words, 5:55pm)
**Goal:** headline→dek→nut graf→two linked sources→flags cleared→journalism DOCX.
- Template pre-seeds Headline/Dek/Lede/Nut Graf/Body/Kicker docs — **delight**: zero setup, the story shape is already there; fact-check panel auto-open.
- Adding 2 sources: Sources panel → manual add form (kind/title/url) ≈ 6 fields, fine. Linking each to a claim: create claim (type + Enter) → per-claim dropdown → find source. **8 interactions for two sourced claims.** Acceptable at n=2 (F-13 bites at n=120).
- Clearing flags: each claim's status is a per-claim `<select>` — no "mark verified" one-click, no keyboard path. Minor here.
- **Export:** Ctrl+E → preset already `journalism` (byline/dateline fields appear — good) → type byline, dateline → Export DOCX → OS save dialog → **status shows a path string; then the writer leaves the app to find the file** (F-12). Total ≈ 6 in-app interactions + 2 outside. The blind-trust question — *"can they trust Export at 5:55?"* — currently **no**: nothing at export confirms flags are cleared (F-12), and the Kicker doc (empty, mid-draft) compiles as silent nothing rather than warning "1 section is empty."
- **Severity ledger:** F-12 Major, F-14 Minor, empty-section silence Minor.

### P2 · Long-form feature writer — `The Long Fall` (6k words, 120 claims, 40 sources)
- **Reorder sections mid-revision:** binder drag works (Alt+↑/↓ too); corkboard **does not** (F-05) — if she reorders where the synopses are (the corkboard), the manuscript doesn't follow. Dead end discovered only later. Major.
- **Attach claim → transcript source:** transcripts exist with timestamped segments (fixture: 2×30). But a claim links to a *source*, and a transcript is a separate entity — there is no transcript-kind source auto-created, no "link claim to transcript@00:14:00". The `locator` field exists on sources for exactly this and nothing populates it from the Transcripts panel. Workflow exists on paper, not in flow. Major (persona), links F-13.
- **Working the claim list:** per F-13 — no status filter/sort; 35 needs-sourcing claims across 6 docs means doc-by-doc patrol with the global outstanding list as the only cross-cut. The outstanding list *does* jump to the doc on click — good bone, needs the claim anchored in text.
- **The packet as the checker:** F-14 — I'd accept it for a 6k feature; I'd want counts and outstanding-first. `CHECK VS AUDIO` flag surviving into the packet is **delight** — that's a real newsroom convention honored.

### P3 · Novelist — `Endings` (106k words, 60 scenes, 3 acts)
- **Restructure Act II on corkboard:** fails structurally (F-05). In the binder it's drag-only at 24 items in a scrolling tree — doable, fiddly, no multi-select (select+drag one at a time). Outliner reorders within the subtree — workable fallback.
- **Collection: POV = Mara:** impossible as designed (F-08). Full-text "Mara" over the whole novel = 11ms (measured — delightfully instant) but semantically wrong.
- **Continuity check on a scene's metadata:** select scene → Inspector → POV/Setting/Characters right there. **Works, 2 interactions.** Outliner shows no POV column, so cross-scene continuity scanning is Inspector-one-at-a-time (F-08 adjacent, Minor).
- **Compile to Shunn:** defaults correct (preset auto-selected, title page + "about X words" rounding, surname/keyword running header with blank first-page header, `#` scene breaks, chapter headings from folders). Inspecting `compile.ts` against Shunn: novel-format compliant to a submission-editor's eye. Underline preserved as underline (modern Shunn prefers italics-as-italics — which is how the editor stores emphasis anyway). **Delight: this is the app's promise kept** — 106k words to a correctly formatted DOCX in ~4 interactions.
- 15k-word Scene 12 typing feel: manual list (F-06 predicts stutter risk).

### P4 · Short-story writer (minimal ceremony)
New Project → type title → pick Short Story → choose folder → Create = **5 interactions to a cursor in "Story."** Draft → Ctrl+E → Export DOCX → save = **3 more.** No novel-tax: template is 2 items + Notes. **This is the best flow in the app — protect it.** Gaps: no dedicated "Shunn short story" variant (novel-style separate title page always; classic short-story format puts the header block + title on page one above the text) — Minor; and the writer types the story title twice (project title ≠ compile title field prefilled from meta — actually prefilled ✓, so only once — verified `CompileDialog.tsx:45`).

### P5 · Nonfiction book author — `Proposal`
- **Assemble package:** template folders match the industry proposal shape (Overview/Bio/Comps/Market/Annotated TOC/Sample chapters) — **delight**, an author with an agent letter in hand recognizes this instantly. Compile scope defaults to the *special* Manuscript folder — for a proposal she must switch scope to "Whole project" or the Proposal folder; scope picker exists (1 interaction), fine.
- **Footnotes:** insertable in-editor, compile to real DOCX footnotes ✓ (`FootnoteReferenceRun`), endnotes in PDF ✓.
- **Bibliography toggle off/on:** Compile → Bibliography select (from sources / stored page / none) — clean, works. ✓
- **DOCX chapter import:** headings/B/I/U survive; **footnotes and images silently dropped** (F-15) — for a footnoted nonfiction chapter this is the persona's worst honest surprise. Major.

### P6 · Academic writer — `Dissertation` (5 chapters, 200 refs)
- **Switch citation style to APA:** Sources panel style select → bibliography preview re-renders; compile References picks it up. ✓ (2 interactions.)
- **Front matter:** F-16 — "Generated at compile" is not true. Major honesty finding.
- **200 refs performance:** fine everywhere (measured); *finding* is findability (F-17), not speed.
- **Is "simple tracked sources" honest?** Mostly yes — no DOI lookup, no dedupe, no in-text citation manager pretensions; in-text citations insert as static text (fine, labeled). The one place it overreaches is the front-matter copy (F-16).

### P7 · The returning writer (3 weeks away, `Endings`)
Cold open lands on Scene 1 with no highlight of where work stopped (F-11). Recents on the launcher get her to the *project* fast ✓. In-project, `updatedAt` exists on every item and is rendered nowhere. Session target resets to zero each launch (correct semantics) but the *deadline* math: 21 days gone, "43 days left · ~1,900 words/day" recalculates honestly ✓ — until the deadline passes, at which point it curdles ("0 days left", no words/day, no adjustment nudge — F-11). **Verdict: reorientation ≈ 60–120s of manual scanning; should be <5s.**

---

## Manual test list (5 minutes, can't be verified headless)

1. **Typing feel in Scene 12** (`Endings`, 15k words): type at full speed mid-paragraph; watch for lag/stutter. Also with Proofread panel open, and in Composition mode. *(F-06)*
2. **Typewriter sound**: toggle on in Settings — click on toggle? sound on keystroke? Enter bell? volume tolerable? *(code: synthesized WebAudio, autoplay switch set)*
3. **Composition mode on multi-monitor**: PLAN says active-monitor only (deferred blackout) — confirm second monitor stays lit and whether that bothers you in practice.
4. **Binder drag at 60+ items**: drag Scene 3 → Act III; scroll-while-drag behavior; drop-indicator clarity; trackpad vs mouse.
5. **Corkboard freeform**: drag/resize cards; confirm new-card overlap after moves; confirm binder order unchanged *(F-05)*.
6. **Save-failure visibility**: make `documents/` read-only mid-typing; observe topbar label (single view) and silence (stitched view) *(F-03)*.
7. **Close-project data loss**: type, immediately click "‹ Projects", reopen *(F-02)*.
8. **Windows native menu + shortcuts**: Ctrl+E/K/P/1/2/3, Alt-menu access, spell-check squiggles + right-click suggestions, thesaurus submenu on a selected word.
9. **In-editor find bar** (`findOpen` in DocumentEditor): how it opens, match navigation, vs the project Find panel.
10. **Focus visibility walk**: Tab around the top bar and a dialog — can you see where you are? *(F-19)*
11. **DOCX import of a real footnoted chapter**: count what survives *(F-15)*.
12. **Export at deadline**: full P1 script with a stopwatch; does the exported DOCX open clean in Word?

---

## Cross-cutting themes (feeds the backlog)

- **T1 · The last 800ms:** autosave is excellent except at the exits (F-02, F-03). Data safety is 99% built and 1% betrayed.
- **T2 · Recovery asymmetry:** prose is protected (snapshots, trash, atomic writes); *structure* is not (F-04, F-05). Writers restructure as much as they write.
- **T3 · Collected but not queryable:** metadata, `updatedAt`, backups, outstanding counts — the DB knows; the UI doesn't say (F-07, F-08, F-11, F-12).
- **T4 · Scale cliffs:** flows comfortable at n=5 fall over at n=120/200 (F-13, F-17) and 15k words (F-06). Fixtures now exist to keep testing at the cliff.
- **T5 · Quiet dishonesty beats loud clutter — but it's still dishonesty:** silent footnote drops, "Generated at compile", empty sections compiling to nothing (F-15, F-16, P1). The calm ethos demands *more* candor, not less.
- **T6 · Chrome creep:** 16 top-bar buttons for an app whose soul is "nothing between me and the page" (F-10, F-09). The fix is consolidation + keyboard, not more UI.
