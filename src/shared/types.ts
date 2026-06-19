// Core data model shared across the main and renderer processes.
// Canonical document content is TipTap/ProseMirror JSON — see DocumentContent.

/** Project archetypes that drive starter templates and enabled workflows. */
export type ProjectType =
  | 'novel'
  | 'novella'
  | 'short-story'
  | 'nonfiction-book'
  | 'journalism-short'
  | 'journalism-long'
  | 'dissertation'
  | 'technical'
  | 'sop'
  | 'college-essay'
  | 'academic-paper'
  | 'thesis'

/** A node in the binder tree. Folders organize; documents hold prose. */
export type BinderItemType = 'folder' | 'document'

export interface BinderItem {
  id: string
  parentId: string | null
  /** Sort order among siblings (0-based). */
  position: number
  type: BinderItemType
  title: string
  synopsis: string
  notes: string
  labelId: string | null
  statusId: string | null
  /** Whether this folder is collapsed in the binder UI. */
  collapsed: boolean
  /** True for template-created structural folders (e.g. Manuscript, Research). */
  isSpecial: boolean
  createdAt: number
  updatedAt: number
  /** Cached word count for outliner/targets; recomputed on save. */
  wordCount: number
}

/** ProseMirror/TipTap document JSON. Opaque to the storage layer. */
export interface ProseMirrorNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

export interface DocumentContent {
  /** Schema/format version for forward migration. */
  version: number
  /** Root ProseMirror doc node. */
  doc: ProseMirrorNode
  /** Editing/formatting mode for this document. Defaults to prose. */
  mode?: 'prose' | 'screenplay'
}

/** Manuscript "paper" defaults — also the default export layout. */
export interface ManuscriptDefaults {
  fontFamily: string
  fontSizePt: number
  /** 1 = single, 2 = double. */
  lineSpacing: number
  marginInches: number
  pageSize: 'us-letter' | 'a4'
}

export interface ProjectSettings {
  manuscript: ManuscriptDefaults
  /** Journalism types turn this on by default. */
  factCheckEnabled: boolean
  theme: 'paper' | 'dark'
  typewriterSound: boolean
  /** Proofreading dialect (drives spell-check dictionary + style checks). */
  english?: 'american' | 'british'
  /** Enforce the Oxford/serial comma (applies in both dialects). */
  oxfordComma?: boolean
  autosaveDebounceMs: number
  backupIntervalMs: number
  maxAutomaticBackups: number
  /** Writing targets & deadline (null = unset). */
  projectWordTarget?: number | null
  sessionWordTarget?: number | null
  deadline?: string | null
}

export interface ProjectMeta {
  id: string
  title: string
  type: ProjectType
  /** Absolute path to the .writeproject folder. */
  path: string
  settings: ProjectSettings
  createdAt: number
  updatedAt: number
}

export interface RecentProject {
  path: string
  title: string
  type: ProjectType
  lastOpenedAt: number
}

export interface Snapshot {
  id: string
  /** Binder item this snapshot belongs to (document-level). */
  itemId: string
  name: string
  createdAt: number
  wordCount: number
}

export interface BackupInfo {
  fileName: string
  path: string
  createdAt: number
  sizeBytes: number
}

/** Filter that drives both ad-hoc search and saved collections. */
export interface CollectionCriteria {
  text?: string
  labelId?: string | null
  statusId?: string | null
}

export interface SearchResult {
  itemId: string
  title: string
  snippet: string
  matches: number
}

/** A saved, reusable, dynamic grouping evaluated from its criteria. */
export interface Collection {
  id: string
  name: string
  criteria: CollectionCriteria
  createdAt: number
}

export type SourceKind =
  | 'web'
  | 'pdf'
  | 'image'
  | 'transcript'
  | 'note'
  | 'url'
  | 'book'
  | 'article'

/** A stored, citeable source: a captured page, a file asset, a transcript, etc. */
export interface Source {
  id: string
  kind: SourceKind
  title: string
  url: string | null
  /** Transcript timestamp, page number, or other locator. */
  locator: string | null
  /** Relative path under the project (research/ or assets/), if a file is stored. */
  filePath: string | null
  notes: string
  /** Bibliographic metadata (for citation generation; all optional). */
  author: string
  /** Containing work: site name, journal, book, etc. */
  container: string
  publisher: string
  /** Publication year or date (free-form, e.g. "2023" or "2023, Mar. 5"). */
  year: string
  createdAt: number
}

/** One line of an interview transcript. */
export interface TranscriptSegment {
  id: string
  transcriptId: string
  position: number
  speaker: string
  timestamp: string
  text: string
}

/** An interview transcript: an ordered list of speaker/timestamp segments. */
export interface Transcript {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface TranscriptWithSegments extends Transcript {
  segments: TranscriptSegment[]
}

export type ClaimStatus = 'verified' | 'needs-sourcing' | 'disputed'

/** A factual assertion in a document, tracked for fact-checking. */
export interface Claim {
  id: string
  docId: string
  text: string
  status: ClaimStatus
  /** A quotation still to be checked against its audio. */
  needsQuoteCheck: boolean
  createdAt: number
}

/** A claim with its linked sources resolved (for the packet/UI). */
export interface ClaimWithSources extends Claim {
  sources: Source[]
}

export type MetaFieldType = 'text' | 'select' | 'number'

/** A user-definable, project-level metadata field (e.g. POV, Setting). */
export interface MetaField {
  id: string
  name: string
  type: MetaFieldType
  options: string[]
  position: number
}

/** Per-item metadata: fieldId -> value. */
export type MetaValues = Record<string, string>

export type CompilePresetId =
  | 'shunn'
  | 'nonfiction-proposal'
  | 'journalism'
  | 'dissertation'
  | 'technical'
  | 'mla'
  | 'apa'
  | 'chicago'

/** A submission layout applied at compile/export. Editable before exporting. */
export interface CompilePreset {
  id: CompilePresetId
  name: string
  font: string
  fontSizePt: number
  lineSpacing: number
  marginInches: number
  pageSize: 'us-letter' | 'a4'
  firstLineIndentInches: number
  titlePage: boolean
  runningHeader: boolean
  sceneBreak: string
  bylineDateline: boolean
  chapterHeadings: boolean
}

/** Front-matter / identifying info supplied at compile time (never stored in prose). */
export interface CompileMeta {
  title: string
  author: string
  contact: string
  keyword: string
  byline: string
  dateline: string
}

/** Ordered compile stream: heading entries (chapter titles) and document entries. */
export interface CompileEntry {
  heading?: string
  docId?: string
  /** Start this entry on a fresh page (e.g. a Works Cited / References page). */
  pageBreak?: boolean
}

export interface CompileRequest {
  entries: CompileEntry[]
  preset: CompilePreset
  meta: CompileMeta
  includeFactCheck: boolean
}

export const DEFAULT_MANUSCRIPT: ManuscriptDefaults = {
  fontFamily: 'Times New Roman',
  fontSizePt: 12,
  lineSpacing: 2,
  marginInches: 1,
  pageSize: 'us-letter'
}

export const PROJECT_DIR_SUFFIX = '.writeproject'
export const DOCUMENT_CONTENT_VERSION = 1
