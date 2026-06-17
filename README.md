# WProcessor

A calm, local‑first, Scrivener‑like writing studio for long‑form work — novels,
journalism, essays, scripts‑in‑progress — built as a desktop app. Everything
lives on your machine; there is no account, no cloud, and no network requirement
to write.

> Active development happens on the **`claude/epic-archimedes-j9876k`** branch.
> The default branch only has this scaffolding — check that branch out first
> (`git checkout claude/epic-archimedes-j9876k`) or you won't see the source.

## What it does

- **Binder** — a drag‑and‑drop project tree (folders, documents, a special
  Manuscript folder) seeded from templates (Novel, Journalism/Feature, …).
- **Manuscript “paper” editor** — a focused rich‑text editor that defaults to a
  standard manuscript page (Times New Roman 12pt, double‑spaced, 1″ margins, US
  Letter). Bold/italic/underline, headings, comments, and footnotes.
- **Composition mode** — full‑screen, distraction‑free typing (Esc to exit).
- **Corkboard, Outliner, and Split view** — see your structure as index cards,
  an outline, or two panes side by side.
- **Autosave, Snapshots & Backups** — debounced autosave, restorable per‑document
  snapshots, automatic interval backups, and a “Back up now” button (zipped).
- **Full‑text search** across the whole project.
- **Metadata & Collections** — POV / Setting / Characters fields, per‑item notes,
  and saved collections.
- **Fact‑check workspace** — track sources and claims, link them, and watch
  outstanding (unverified / unsourced) claims clear. Auto‑opens for journalism
  projects.
- **Research/readability** — extract clean prose from pasted web content.
- **Compile / Export** — DOCX, PDF, and ePub with editable Shunn‑style manuscript
  presets.
- **Import** — HTML/DOCX, Markdown, and existing **Scrivener** projects (`.scriv`
  binder + document text).
- **American‑English spell check** by default, with right‑click suggestions.
- **Settings** — adjust the editor’s paper defaults, autosave/backup cadence, and
  an optional (off by default) subtle typewriter keystroke sound.

## Tech stack

Electron + electron‑vite, React + TypeScript, TipTap/ProseMirror for the editor,
and `better-sqlite3` for a fast local index. Packaging via `electron-builder`.

## Prerequisites

- **Node.js 18–22** and npm. (Node 24 also works; see the note below.)
- The one native module (`better-sqlite3`) is installed as a **prebuilt Electron
  binary** — the included `.npmrc` points npm at Electron’s prebuilds, so **no
  Visual Studio / C++ compiler is required** in the normal case.

## Getting started (development)

```bash
git clone <repo-url>
cd WProcessor
git checkout claude/epic-archimedes-j9876k
npm install
npm run dev          # launches the app with hot reload
```

## Building a distributable

There is **no pre‑built executable in the repo** — installers are
platform‑specific binaries and are not committed (`release/` is gitignored).
Build one on the target platform:

```bash
npm run package:win   # Windows  → release\WProcessor-<version>-setup.exe (NSIS installer)
npm run package:dir   # current OS, unpacked folder (no installer) for quick testing
```

`package:win` must be run **on Windows** to produce a Windows installer.

## Useful scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the app in development with hot reload |
| `npm run build` | Type‑check and build main/preload/renderer into `out/` |
| `npm run typecheck` | Type‑check the node and web sides |
| `npm run package:win` | Build a Windows NSIS installer into `release/` |
| `npm run package:dir` | Build an unpacked app for the current OS into `release/` |
| `npm run rebuild` | Rebuild `better-sqlite3` against the local Electron |

## Where your work is stored

Projects are self‑contained: a local SQLite index plus your document files and
zipped backups, at the location you choose when you create the project. Because
everything is on disk, you can back the folder up or move it like any other.

## Project layout

```
src/
  main/        Electron main process — window, IPC, services (project store, export, import)
  preload/     Secure bridge exposed to the renderer
  renderer/    React UI
    src/
      components/  Workspace, Binder, editor panels, dialogs (Compile, Settings, …)
      editor/      TipTap extensions (comments, footnotes) + annotation helpers
      store/       App state
      lib/         Helpers (e.g. typewriter sound)
      styles/      Global CSS
  shared/      Types shared between main and renderer
electron-builder.yml   Packaging configuration
```

## Troubleshooting

- **`npm install` tries to compile `better-sqlite3` / “Could not find any Visual
  Studio installation”** — this means the prebuilt binary wasn’t used. Make sure
  you’re installing from the project root (so the included `.npmrc` is picked up;
  `npm config get runtime` should print `electron`). If a previous install was
  interrupted, delete the partially‑written `node_modules` folder and run
  `npm install` again. Only as a last resort (e.g. no matching prebuilt) do you
  need the **Visual Studio Build Tools** (“Desktop development with C++”) + Python.
- **`'electron-vite' is not recognized`** — `npm install` didn’t finish (usually
  because of the native‑module error above). Fix the install first; `electron-vite`
  is a dev dependency that only exists once `npm install` completes successfully.
- **`npm warn cleanup Failed to remove … EPERM`** — Windows had files locked
  (often an editor, antivirus, or OneDrive sync on `Downloads`). Close those, and
  prefer a short, non‑synced path like `C:\dev\WProcessor`. Then delete
  `node_modules` and re‑run `npm install`.
- **Node 24 note** — everything is JS except the prebuilt SQLite binary, so Node
  24 works. If you hit an unrelated tooling hiccup, Node 20 LTS is the safe choice.
- **App launches but can’t open a project / native module error** — run
  `npm run rebuild` so `better-sqlite3` matches your Electron version.
- **Spell‑check squiggles don’t appear** — the en‑US dictionary is fetched on
  first use; on Windows it uses the OS spell checker. A first‑run network fetch
  may be required on some platforms.

## Packaging note

`electron-builder` is intentionally pinned to **24.13.3**. The 25.x line’s
node_modules collector relocates a hoisted transitive dependency
(`archiver-utils`, shared by `archiver` and `zip-stream`) under a single parent
inside the asar, which makes the packaged app throw `Cannot find module
'archiver-utils'` at startup. 24.13.3 packages the hoisted layout correctly.
