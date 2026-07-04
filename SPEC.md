# Foolscap — Specification

*The source-of-truth description of what this app is meant to be. Where the code
and this document disagree, that is a bug in one of them — fix it, don't let the
gap widen. Companion to `PLAN.md` (build history/milestones) and the audit pair
`REVIEW_FINDINGS.md` / `UPGRADE_BACKLOG.md`. Reflects the app as shipped on
`claude/epic-archimedes-j9876k`.*

---

## 1. What it is

Foolscap is a calm, **local-first, offline** writing studio for long-form work —
novels, features, essays, dissertations, proposals, short stories. It is a
desktop app (Electron). There is no account, no cloud, no network requirement to
write. It is a place to **draft, organize, research, and ship** a manuscript,
built for people who live in it for hours a day.

**The ethos, in one line:** *nothing between you and the page.* Calm, unbusy,
keyboard-first, monochrome. Minimal chrome — but never minimal to the point of
undiscoverable (a command palette and a summonable cheat sheet make the quiet UI
learnable).

Judge every feature and change against **what the app is trying to be**, not
against generic modern software. "Add a toolbar / ribbon / persistent panel" is
almost never the answer here (see §7).

## 2. Invariants (never violate)

1. **Canonical content = TipTap/ProseMirror JSON.** Lossless. One file per
   document under `documents/<uuid>.json`. Convert to other formats only at
   export.
2. **Words are separated from presentation.** Manuscript look and every
   submission standard are *output presets*. Compile/export is **non-destructive**
   and never mutates working documents.
3. **Data safety is non-negotiable.** Project = a `.writeproject` folder.
   Atomic writes (temp file + rename). Continuous autosave. Manual snapshots.
   Automatic timestamped zip backups. Pending saves are flushed before the
   project closes or the app quits, and a write that fails to reach disk is
   surfaced loudly and retried — work is never lost silently.
4. **No live pagination.** A continuous paper-width column while writing; true
   pagination only at compile/export.
5. **Calm, quiet, keyboard-first, monochrome.** Two themes only: light "paper"
   for writing, dark for composition. No accent creep.
6. **The renderer never touches disk or the database.** All storage lives in the
   main process behind a typed preload bridge (`window.api`). Keeps writing data
   away from renderer crashes.
7. **The app stays launchable and usable at the end of every change.** Gate:
   `npm run typecheck` + `npm run build` + `WP_SELFTEST` (headless main-process
   assertions) + a headless xvfb GUI smoke, all green, before every push.

## 3. Architecture

```
src/
  main/        Electron main: window/app lifecycle, IPC handlers, services (disk + sqlite)
    services/  project, db, documents, snapshots, backups, templates, compile,
               importer, search, sources, factcheck, metadata, transcripts,
               corkboard, thesaurus, pdfannotations, atomic, paths, recents
    ipc/       one typed IPC surface
  preload/     contextBridge — the ONLY renderer↔main channel (no nodeIntegration)
  renderer/    React + TipTap UI (binder, editor, inspector, corkboard, outliner, compile, …)
    store/     Zustand app state
    editor/    TipTap extensions (comment, claim, footnote, screenplay, track-changes,
               proofreader, blockformat, image, findreplace, annotations)
    lib/       helpers (undo stack, command bus, tree ops, typewriter sound, pdfjs)
  shared/      types + pure logic shared across processes (citations, presets,
               proofreader, diff, screenplay, …)
```

Project folder on disk:

```
MyNovel.writeproject/
  project.db      SQLite: tree order, titles, synopses, metadata, labels, sources,
                  claims, collections, transcripts, settings, ui.lastSelectedId,
                  corkboard.layout
  documents/      one file per document (TipTap JSON)
  assets/         images, portraits, attached PDFs
  research/        captured web snapshots
  snapshots/      manual + automatic per-document version history
  backups/         automatic timestamped zips of the whole project
```

**Tech:** Electron + electron-vite, React + TypeScript, TipTap/ProseMirror,
`better-sqlite3` (synchronous, rebuilt for Electron), `electron-builder` (pinned
24.13.3). Pandoc is **not** bundled; targeted libs (`mammoth`/`docx`/`archiver`)
plus a converter seam. Windows is the primary target; the codebase is portable.

## 4. Feature scope (as shipped)

**Projects & structure**
- Launcher: create (from a type template) / open / recent projects. Project
  types: novel, novella, short story, nonfiction book, journalism (short/feature),
  dissertation, technical, SOP, college essay, research paper, thesis — each seeds
  its own binder skeleton, and several offer optional structure overlays.
- Binder: drag-reorder tree of folders/documents (a special "Manuscript"-class
  folder is the default compile scope). Trash with restore.
- Three folder views: **Scrivenings** (stitched, virtualized continuous editor),
  **Corkboard** (index cards — a Grid mode where card order *is* binder order, and
  a Freeform mode for pinned/resizable cards that don't change order), **Outliner**
  (TanStack table; inline-editable; optional metadata columns).

**Writing**
- Manuscript "paper" editor: Times New Roman 12pt, double-spaced, 1″ margins, US
  Letter by default (all adjustable in Settings — the *working view* only).
- Bold/italic/underline, headings, lists, blockquote, images, comments,
  footnotes/endnotes. Smart quotes. American/British spell-check with right-click
  suggestions and an offline **WordNet thesaurus** (right-click a word).
- **Composition mode**: full-screen, distraction-free, dark, optional typewriter
  scrolling and an optional synthesized keystroke sound. Split view. Screenplay
  mode. Track changes (suggesting). A live **proofreader** (dialect / Oxford-comma
  / repeats / spacing) that recomputes incrementally so typing stays fast at book
  length.

**Safety & recovery**
- Debounced atomic autosave; flush-on-exit; loud, self-clearing save-failure
  banner with automatic retry. Manual + automatic snapshots (with diff and
  one-click restore). Automatic zip backups, listed and restorable (into a *new*
  sibling folder — never overwriting in place). **Structural undo** (Ctrl+Z
  outside a text field) for binder moves/renames/trash and metadata edits.

**Research, metadata & fact-check**
- Web capture (Readability + sanitize), PDFs/images as assets, a research viewer
  beside the draft, PDF annotation. Per-item metadata (POV/Setting/Characters +
  user-defined fields). Saved **collections** that filter on text, label, status,
  **and custom metadata** ("POV = Mara").
- Fact-check workspace: claims tied to sources with verified / needs-sourcing /
  disputed status and a quote-vs-audio flag; project-wide outstanding list;
  status filter chips; **claims anchored to the prose** (select a sentence → flag;
  click a claim → jump to it). Interview transcripts (speaker/timestamp segments)
  that cite to timestamped sources. Auto-opens for journalism projects.

**Compile / Export / Import**
- Compile assembles in binder order, applies an editable **preset**
  (Shunn manuscript, Shunn short-story, nonfiction proposal, journalism,
  dissertation/academic, MLA/APA/Chicago), non-destructively. A compile-time
  fact-check gate shows outstanding counts; Open / Show-in-folder after export.
- Export: DOCX (title page, chapter headings, running header, footnotes, scene
  breaks, generated Word ToC field), PDF, ePub, Markdown, plain text.
  Auto-generated Works Cited / References / Bibliography from the real Sources,
  per style, with hanging indent. Fact-check packet (a checker's briefing) exports
  alongside.
- Import: DOCX (mammoth), Markdown, RTF, TXT, PDF (structured), and Scrivener
  `.scrivx`. Imports report what survived and what was dropped.

## 5. Interaction & accessibility contract

- **Keyboard-first, but learnable.** Command palette (Ctrl/⌘ K), Go-to
  (Ctrl/⌘ P), a Help/Shortcuts sheet (Ctrl/⌘ /). Ctrl/⌘ S acknowledges autosave
  and snapshots. Esc closes the topmost panel. The right-hand detail panels share
  one slot (opening one closes the others) so the editor is never crushed.
- **Accessibility.** WCAG-AA text contrast in both themes; a visible
  `:focus-visible` ring on every control; aria-labels on icon-only buttons;
  drag operations have keyboard alternatives where practical. In-app sheets
  replace native `prompt`/`confirm`.
- **No unsaved state by design.** Quit/close never risks the last keystroke.

## 6. Testing & verification

- **Headless self-test** (`WP_SELFTEST=1`): main-process storage + pure-logic
  assertions (round-trips, citations, proofread, import classification, backup
  restore, metadata-filtered search, compile layouts).
- **Headless GUI smoke** (`WP_SMOKE=1` under xvfb): boots the window, mounts and
  drives every panel — catches renderer/import-time crashes.
- **Fixtures** (`/fixtures`): deterministic generators for five realistic
  `.writeproject` projects (90k-word novel with a 15k-word scene, 6k feature with
  120 claims, news brief, dissertation with 200 refs, proposal) + a storage
  perf-probe.
- **What headless can't verify** lives in the "5-minute manual test list" in
  `REVIEW_FINDINGS.md` (typing feel, typewriter sound, multi-monitor composition,
  trackpad/drag, opening compiled DOCX in Word). Trace the code, state the
  uncertainty, hand the human a checklist — never claim to have felt what you
  couldn't.

## 7. Non-goals ("do not do")

Tempting additions that would betray the design. Each is wrong *for this app*:

- **A persistent formatting toolbar/ribbon.** Chrome between writer and page; the
  bubble menu + palette + shortcuts already cover it.
- **Document tabs.** The binder is the navigation; Quick Open is the accelerator;
  "resume where I was" covers the real need.
- **Cloud sync / accounts.** Local-first is the covenant. Backups + a plain
  folder the writer can sync themselves suffice.
- **A full reference manager** (Zotero-style groups, DOI lookup, dedupe). v1 is
  honestly "simple tracked sources"; a filter fixes findability without becoming a
  second app. In-text citations are static text by design.
- **Live pagination / print-layout while writing.** Explicitly forbidden by
  invariant 4.
- **Gamified streaks/badges/confetti.** Targets stay gentle math, never guilt or
  dopamine chrome.
- **Ambient AI writing/rewriting in the editor.** "Your words are sacred."
  Anything generative is, at most, an explicit user action behind the palette —
  never suggestions while typing.
- **A plugin/theme marketplace.** Two monochrome themes are a design position.

## 8. Out of current scope (candidates, not commitments)

Multi-window projects; a real in-text citation manager; OCR of scanned PDFs;
collaborative editing. None are promised; none may quietly pretend to exist. If a
template or label implies a capability, the app must actually deliver it or say
plainly that it doesn't.
