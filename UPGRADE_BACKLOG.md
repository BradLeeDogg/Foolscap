# Foolscap — Upgrade Backlog

*Companion to `REVIEW_FINDINGS.md` (2026-07-02). Every ticket is written to be buildable
by a future session with no further context: problem, linked findings, proposed change,
acceptance criteria, effort (S ≤ half-day, M ≤ 2 days, L > 2 days), personas served, ethos check.*

**Ethos test applied to every ticket:** does it remove friction without adding noise
between the writer and the page? Tickets that would fail the test live in the
**Do-not-do list** at the bottom.

**Suggested order:** Tier 1 (trust) → Tier 2 (quick wins) → Tier 3 (structural). Within
a tier, top-to-bottom. T-01/T-02 before anything else — they protect words.

---

## Tier 1 — Trust repairs (do these first)

### T-01 · Flush pending autosave on project close and app quit
**Problem:** The last ≤800ms of typing (plus in-flight writes) is silently lost when closing the project or quitting; the close path tears down the DB before the editor's cleanup save runs, and that save's failure is swallowed. *(Finding F-02 — Blocker)*
**Change:**
- Renderer: extend the store's `flushActive` idea to a `flushAllDirty(): Promise<void>` registry — every mounted `DocumentEditor` registers its `save()`; `Workspace.handleClose` awaits it **before** `window.api.project.close()`.
- Main: in the window `close` event, `preventDefault()`, send `app:flush-request`, await renderer ack (with a 2s timeout so a hung renderer can't block quit), then destroy. Same handshake in `before-quit` for menu/Cmd-Q quits.
- `DocumentEditor` unmount save: `await` it inside the flush path rather than fire-and-forget.
**Accept:** type a word → immediately close project / quit → reopen → word is present. Repeat with a 5s artificial write delay: app quits within timeout, word present. WP_SELFTEST gains an assertion for close-with-dirty-doc.
**Effort:** M · **Personas:** all · **Ethos:** invisible; pure trust.

### T-02 · Make save failure loud, everywhere
**Problem:** Failed autosave = tiny topbar label in the active editor; **no signal at all** from stitched/split editors (`active=false`). Disk-full/AV-lock becomes quiet data loss. *(F-03 — Blocker)*
**Change:** route save errors from *any* editor instance to a store-level `saveError` → one persistent, dismiss-proof banner across the top of the editor pane: “Your last change couldn’t be saved to disk (reason). Retrying…” with automatic retry/backoff; clears itself on the next successful write. Keep the calm topbar label as the steady-state indicator.
**Accept:** make `documents/` read-only while typing in (a) single view, (b) scrivenings → banner appears in both within one debounce; restore permissions → banner clears without user action. No dialog, no sound.
**Effort:** S–M · **Personas:** all · **Ethos:** a banner only when words are at risk is the *opposite* of noise.

### T-03 · Backups panel: list, restore, last-backup indicator
**Problem:** Interval backups run but are invisible; restore = hand-unzipping. `backup:list` IPC already exists, unused. *(F-07 — Major)*
**Change:** add a “Backups” section inside the existing Snapshots panel (one surface for “time travel,” not a new button): list zips (name, date, size) via `backup:list`, “Restore…” = pick a backup → restore **to a new sibling folder** (`MyNovel (restored 2026-07-02).writeproject`) and open it — never overwrite in place. Show “Last backup 12m ago · next in 3m” in Settings’ backup section.
**Accept:** take backup → see it listed with correct date/size; restore → new project folder opens with pre-backup content; original untouched.
**Effort:** M · **Personas:** all (novelist most) · **Ethos:** consolidates into an existing panel; zero new chrome.

### T-04 · Undo for structural operations
**Problem:** Binder moves/renames, corkboard placement, outliner edits, synopsis/label/status/metadata edits are irreversible; editor undo also dies on every doc switch. *(F-04 — Major; theme T2)*
**Change (scoped, not a framework):**
- Store-level command stack for **binder ops** (move, rename, trash/restore) and **item metadata** (synopsis, notes, label, status, field values): each mutation pushes an inverse op; Ctrl+Z outside a focused text field pops it (Ctrl+Shift+Z redo). Cap 50.
- Toast the inverse hint after risky ops: “Moved ‘Scene 12’ to Act III — Ctrl+Z to undo” (auto-fade 4s).
- Editor history across visits: persist per-doc ProseMirror history is not feasible; instead auto-snapshot on doc switch when >200 words changed since last snapshot (cheap, uses existing snapshot service) so “more than a keystroke, never more than a click.”
**Accept:** drag scene to wrong act → Ctrl+Z restores exact position; rename → undo restores title; synopsis edit → undo; each verified with binder-tree assertions in selftest. Toast appears/fades.
**Effort:** L · **Personas:** novelist, feature writer, all · **Ethos:** keystroke-first recovery; one transient toast is the only visible addition.

### T-05 · Fact-check gate + post-export affordances in Compile
**Problem:** Nothing at export says claims are outstanding; exported path is dead text. *(F-12 — Major)*
**Change:** in `CompileDialog`, query `factcheck.outstanding()` on open when the project has claims: render one line above the export buttons — “✓ All 120 claims verified” or “⚠ 34 claims outstanding (31 need sourcing, 3 disputed) — View”, where View opens the Fact-check panel. Not a blocker, a visible fact. After any export, render `Open` and `Show in folder` buttons next to the status path (`shell.openPath` / `shell.showItemInFolder` via one new IPC).
**Accept:** journalism fixture: dialog shows the ⚠ line with correct counts; clearing claims flips it to ✓ without reopening. Export → “Show in folder” opens Explorer at the file.
**Effort:** S · **Personas:** journalist, feature writer · **Ethos:** one line of truth at the moment of commitment; removes an out-of-app scavenger hunt.

---

## Tier 2 — Quick wins (S each, high leverage)

### T-06 · Restore corkboard ↔ binder ordering (keep freeform as a mode)
**Problem:** Freeform rewrite silently removed “drag reorders binder” (spec regression F-05); card position no longer means anything to the manuscript.
**Change:** two-mode corkboard, defaulting to **Grid (ordered)**: grid mode = the previous sortable grid whose drops call `binder.move`; **Freeform** = current behavior, explicitly labeled (“positions don’t change manuscript order”). Toggle lives in the corkboard header next to “＋ Add card”; per-folder persisted.
**Accept:** grid mode: drag card 3 before card 1 → binder + scrivenings + compile order change to match. Freeform mode: unchanged from today; label present. Novelist P3 task passes.
**Effort:** M (mostly resurrecting deleted code) · **Personas:** novelist, feature writer · **Ethos:** restores a spec behavior; the label is honesty, not chrome.

### T-07 · Ctrl+S = acknowledge + snapshot
**Problem:** Ctrl+S is dead; writers hit it reflexively and get silence, which *undermines* autosave trust. *(F-09)*
**Change:** Ctrl+S flushes any pending save immediately, flashes the topbar save label (“Saved ✓”), and — if >0 words changed since the last snapshot — takes an automatic snapshot named “Ctrl+S”. Menu: File → “Save now (snapshot)”.
**Accept:** press Ctrl+S mid-sentence → label flashes, snapshot appears in panel; pressing again with no changes takes no duplicate snapshot.
**Effort:** S · **Personas:** all · **Ethos:** meets muscle memory with reassurance; zero new UI.

### T-08 · Escape closes the topmost panel; shortcuts for the big three panels
**Problem:** Panels are mouse-only to close; none has a shortcut. *(F-09)*
**Change:** global Esc handler (when no modal/composition and editor selection not collapsing) closes the most recently opened side panel. Add accelerators: Ctrl+Shift+I Inspector, Ctrl+Shift+R Sources (research), Ctrl+Shift+F Fact-check — registered in the native menu (View) so they’re discoverable, palette hints updated, Help sheet updated.
**Accept:** open Inspector + Sources → Esc closes Sources, Esc closes Inspector, third Esc does nothing; shortcuts toggle their panels from the keyboard only.
**Effort:** S · **Personas:** all · **Ethos:** strictly removes pointer round-trips.

### T-09 · Fix light-theme faint contrast + visible button focus
**Problem:** `--ink-faint` 2.64:1 fails AA; buttons have no visible keyboard focus. *(F-19)*
**Change:** `--ink-faint: #7d786d` (≥4.5:1 on `--paper`; verify with the ratio script in the findings). Add `button:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }` and audit that no component sets `outline: none`. Add `aria-label` to every icon-only button (×, ⚙, ⤓, ⇲, ↗, color swatches, trash icons).
**Accept:** ratio script passes AA for ink/ink-soft/ink-faint in both themes; tabbing the top bar shows a focus ring on each control; axe-style spot check finds no unlabeled icon buttons.
**Effort:** S · **Personas:** all; accessibility · **Ethos:** invisible until you navigate by keyboard — then essential.

### T-10 · Import summary (DOCX/RTF/Scrivener): say what was dropped
**Problem:** DOCX import silently drops footnotes and images. *(F-15, T5)*
**Change:** `importFromFile` returns counts `{paragraphs, headings, footnotesDropped, imagesDropped}` (mammoth reports footnotes; count `<img>` stripped). After import, one toast/dialog line: “Imported ‘Chapter 3’ — 42 paragraphs, 3 headings. Not imported: 17 footnotes, 2 images.” Link “What imports?” to a Help section that states limits plainly (like the existing .scriv note in PLAN).
**Accept:** import a fixture DOCX with footnotes+images → toast shows correct counts; clean DOCX → “Nothing was dropped.”
**Effort:** S–M · **Personas:** nonfiction author, academic · **Ethos:** candor over silence; one transient line.

### T-11 · Fix the dissertation front-matter lie
**Problem:** Template synopses say “Generated at compile”; compile generates nothing. *(F-16)*
**Change (choose one, prefer a):**
a) Compile-time ToC: when preset `dissertation`/`chicago`, replace a document titled “Table of Contents” with generated entries (chapter headings + page refs where the format allows; DOCX `TableOfContents` field is supported by the docx lib — insert field, Word paginates on open).
b) If (a) is descoped: change synopses to “Fill in, or delete before compile” and skip **empty** documents at compile with a per-run note (“Skipped 3 empty documents”).
**Accept:** (a) compile dissertation fixture → DOCX contains a ToC field listing 5 chapters; or (b) copy updated + empty docs skipped with a status line, nothing silently blank in output.
**Effort:** a=M, b=S · **Personas:** academic · **Ethos:** the template stops promising what the tool doesn’t do.

### T-12 · Packet upgrade: summary header + outstanding-first
**Problem:** Packet is a dump; the checker wants a briefing. *(F-14)*
**Change:** header (project title, export timestamp, counts by status, quote-check count); an “OUTSTANDING” section first (needs-sourcing + disputed with doc titles), then the by-document listing; include source author/year/notes when present.
**Accept:** feature fixture export → header counts match DB (72/34/14 per fixture ratios), outstanding section lists exactly the non-verified claims.
**Effort:** S · **Personas:** feature writer, journalist · **Ethos:** same single .txt file, better ordered.

### T-13 · “Where was I” — reopen at last position + a quiet resume line
**Problem:** Every open lands on the first document; `updatedAt` rendered nowhere; expired deadline = guilt UI. *(F-11)*
**Change:** persist `ui.lastSelectedId` in project `meta` on selection change (throttled); on open, select it if it still exists. Under the topbar on first paint after open, one dismissable line: “Resuming ‘Scene 41’ · last edited 3 weeks ago.” In Targets, when deadline < today: “Deadline passed — pick a new date?” with the date field focused; never show “0 days left”.
**Accept:** edit Scene 41 → close → reopen → Scene 41 selected + resume line correct; set deadline yesterday → panel shows the gentle prompt, no 0-days math.
**Effort:** S–M · **Personas:** returning writer, novelist · **Ethos:** one line that answers the only question a returning writer has, then gets out of the way.

### T-14 · Compile dialog: hide fields the preset ignores
**Problem:** Journalist compiling a brief sees Scene break / running-header keyword / Contact block that `journalism` preset ignores. *(F-12)*
**Change:** render Contact/keyword only when `titlePage || runningHeader`; Scene break only when `sceneBreak` is meaningful for the preset (fiction presets); keep everything reachable by switching preset. No new options.
**Accept:** journalism preset → dialog shows Title/Author/Byline/Dateline/fact-check only; shunn preset → full set returns.
**Effort:** S · **Personas:** journalist · **Ethos:** subtraction.

### T-15 · Sources panel: filter box + sort
**Problem:** 200 references = scroll archaeology; claim-link dropdowns inherit the chaos. *(F-17, F-13)*
**Change:** one filter input above the source list (matches title/author/year/kind, same substring style as Quick Open); sort select (Recent / Title / Author / Year). Reuse the filtered+sorted list for the claim “+ link source…” control by replacing the native select with the same tiny filterable popover used for Quick Open.
**Accept:** dissertation fixture: typing “estuarine 2019” narrows to matching refs; claim-linking in feature fixture reaches any of 40 sources in ≤3 keystrokes + Enter.
**Effort:** M · **Personas:** academic, feature writer · **Ethos:** search-not-scroll is the keyboard-first answer; no persistent new chrome.

---

## Tier 3 — Structural investments

### T-16 · Idle/incremental proofreading (typing latency at book length)
**Problem:** Full-document regex pass on every keystroke; measured 11–13ms JS alone at 15k words, before decoration/React costs. *(F-06 — Major)*
**Change:** in the ProseMirror plugin: on `docChanged`, recompute **only textblocks touched by the transaction** (map old issues through `tr.mapping`, re-run rules for changed blocks); schedule a full re-pass on `requestIdleCallback` (debounced ~600ms) to catch cross-block rules (repeated-word across a join). Skip all work while the doc exceeds ~50k chars **and** the Proofreader panel is closed, running only on idle in that case.
**Accept:** benchmark harness (extend `fixtures/perf-probe.cjs` approach): synthetic keystroke transactions on the 15k-word doc show per-keystroke proofread cost <1ms; issue list still converges to identical results vs the naive pass (assert same issues on fixture docs); manual: Scene 12 typing feels unchanged from a 1k-word doc.
**Effort:** L · **Personas:** novelist, academic, everyone at length · **Ethos:** the whole ethos is typing feel; this is the ethos ticket.

### T-17 · Metadata-aware collections and outliner columns
**Problem:** POV/Setting/Characters are seeded, edited, stored — and unqueryable; outliner hides them. *(F-08 — Major)*
**Change:** extend `CollectionCriteria` with `fields?: Array<{fieldId, value}>` (exact/contains match); `searchProject` joins `metadata_values` (SQL, no doc reads needed when text absent). FindPanel gains one “Field…” row (field select + value input) shown only when custom fields exist. Outliner: add optional columns for each custom field behind a single “Columns ▾” header menu (off by default, per-project persisted).
**Accept:** novel fixture: collection “POV = Mara” returns exactly the scenes whose POV value is Mara (assert vs DB); saved, reloads correctly; outliner can show a POV column and inline-edit it.
**Effort:** M–L · **Personas:** novelist (flagship), feature writer · **Ethos:** the data already exists; this makes a promise the Inspector already made come true. Columns hidden by default preserves calm.

### T-18 · Panel discipline: exclusive-by-default side panel + overflow menu
**Problem:** 16 top-bar buttons; 11 independently stacking panels can squeeze the editor to 25%. *(F-10 — Major; T6)*
**Change (consolidation, not redesign):**
- Right-hand panels become **one slot, exclusive by default**: opening Sources replaces Inspector (writers get panel-swap, not panel-stack). Power escape hatch: a pin (📌) per panel header allows exactly one pinned + one active (two max).
- Top bar shrinks to: ‹ Projects · title ·· words · save state · Find · Split · Compose · Corkboard · **Panels ▾** (menu listing Inspector/Sources/Fact-check/Transcripts/Proofread/Analysis/Targets/Snapshots with their shortcuts) · ⚙ · Compile. (Fact-check keeps auto-open for journalism; it opens *in the slot*.)
- All panels remain one keystroke away via palette + the T-08 accelerators.
**Accept:** opening any two unpinned panels never shows both; editor never narrower than 55% with one panel; every removed button’s function reachable via Panels ▾ **and** palette **and** (big three) shortcut; smoke test updated for new mount paths.
**Effort:** L · **Personas:** all; short-story writer most (calm) · **Ethos:** this *is* the ethos: fewer things between writer and page, with discoverability preserved via menu + palette + help.

### T-19 · Claims anchored to text + transcript-linked sources
**Problem:** Claims are free-floating strings — the checker can’t jump claim→sentence; transcripts can’t be cited with timestamps despite `locator` existing for exactly that. *(F-13, P2)*
**Change:**
- “Add claim from selection”: selecting prose in a doc and invoking (context menu + palette) creates a claim whose text = selection and stores `{from,to}` anchor (best-effort, remapped on edit like comments already are — reuse the comment mark infrastructure: a `claim` mark with claimId).
- Fact-check panel: clicking a claim with an anchor selects the doc *and* scrolls to/flashes the marked range.
- Transcripts panel: “Cite segment” button on a segment creates/link a source (kind `transcript`, title = transcript name, locator = timestamp) and offers to link it to the currently selected claim.
- Panel: status filter chips (All / Needs / Disputed / Verified) above the per-doc list.
**Accept:** feature fixture: select a sentence → add claim → claim appears with anchor; click claim → editor scrolls to highlighted sentence; cite Interview 1 @ 00:14:00 → source exists with locator, linked; filter chips narrow list correctly; packet shows the locator.
**Effort:** L · **Personas:** feature writer, journalist · **Ethos:** ties the fact-check apparatus to the prose instead of beside it; no always-on decoration (marks render only while the panel is open).

### T-20 · Shunn short-story variant preset
**Problem:** Single fiction preset always emits a separate title page; classic short-story manuscript format wants contact block + title ~1/3 down page one, text following on the same page. *(P4 — Minor)*
**Change:** `shunn-short` preset: no separate title page; first page renders contact block (top-left), word count (top-right), centered title/byline a third down, then the story; running header from page 2. Default preset for `short-story` type.
**Accept:** compile short-story fixture → page 1 matches the convention (manual inspection in Word); novel preset unchanged.
**Effort:** M · **Personas:** short-story writer · **Ethos:** honors a convention writers already know; zero UI added (it’s a preset).

### T-21 · Replace `window.prompt/confirm` with consistent in-app affordances
**Problem:** Native prompts break flow and confirm policy is inconsistent (claim delete: none; field delete: confirm). *(F-21 — Polish)*
**Change:** one small `promptSheet()`/`confirmSheet()` styled like the palette; policy: destructive-and-unrecoverable → confirm; destructive-but-undoable (post T-04) → toast-with-undo, no confirm.
**Accept:** naming a collection uses the sheet (autofocus, Enter/Esc); deleting a claim shows toast-with-undo; deleting a metadata field still confirms (values unrecoverable) until covered by T-04.
**Effort:** M · **Personas:** all · **Ethos:** fewer jarring OS interruptions; undo-over-confirm reduces dialog noise.

---

## Do-not-do list

Tempting upgrades that would betray the design. Each: why tempting → why wrong.

1. **A formatting toolbar/ribbon above the editor.** Tempting: discoverability of bold/headings. Wrong: permanent chrome between writer and page; the bubble menu + palette + shortcuts already cover it. (The findings above never require it.)
2. **Tabs for open documents.** Tempting: IDE muscle memory. Wrong: tabs are an open-loop inventory that nags; the binder *is* the navigation, Quick Open is the accelerator. T-13 solves the real need (resume).
3. **Cloud sync / accounts.** Tempting: device mobility, “backup.” Wrong: local-first is the covenant (PLAN invariant); sync failure modes would import exactly the anxiety this app exists to remove. Backups (T-03) + a plain folder writers can Dropbox themselves suffice.
4. **A real reference manager (Zotero-style groups, DOI lookup, dedupe).** Tempting: F-17 pain. Wrong: v1’s honesty is “simple tracked sources”; T-15’s filter fixes findability without becoming a second application inside the first.
5. **Live pagination / print-layout view while writing.** Tempting: “where will page 200 fall?” Wrong: explicit PLAN invariant — presentation is an output step; live pagination couples typing feel to layout math (the exact trap F-06 warns about).
6. **Gamified streaks, badges, confetti on targets.** Tempting: motivation features demo well. Wrong: targets already flirt with guilt UI (F-11); the fix is gentler math, not dopamine chrome.
7. **AI writing/rewriting inside the editor.** Tempting: market pressure. Wrong for *this* app’s covenant (“your words are sacred”); anything generative belongs, at most, behind the palette as explicit user action — never ambient suggestions while typing.
8. **Plugin architecture / theme marketplace.** Tempting: extensibility. Wrong: two monochrome themes are a design position; a plugin surface multiplies QA and invites exactly the clutter the top bar already suffers (F-10).
9. **Multi-select everything in the binder.** Tempting: bulk restructure power. Wrong at v1: dnd multi-select complicates the tree’s drag model enormously; T-04 undo + outliner reorder cover the realistic failure modes first. Revisit only with evidence after T-04/T-06 land.
10. **Replacing the on-demand search with an FTS index now.** Tempting: “real apps index.” Wrong: measured 11ms over 106k words; an index adds write-amplification and corruption surface to the most sacred store for zero felt gain. Revisit at 1M+ words with measurements.

---

## Coverage map (findings → tickets)

| Finding | Ticket(s) |
|---|---|
| F-02 | T-01 |
| F-03 | T-02 |
| F-04 | T-04, T-21 |
| F-05 | T-06 |
| F-06 | T-16 |
| F-07 | T-03 |
| F-08 | T-17 |
| F-09 | T-07, T-08 |
| F-10 | T-18 |
| F-11 | T-13 |
| F-12 | T-05, T-14 |
| F-13 | T-15, T-19 |
| F-14 | T-12 |
| F-15 | T-10 |
| F-16 | T-11 |
| F-17 | T-15 |
| F-19 | T-09 |
| F-21 | T-21 |
| P4 (Shunn short) | T-20 |
| F-01, F-18, F-20, F-22 | documentation/no-action (F-01: commit a SPEC.md snapshot of current truth) |
