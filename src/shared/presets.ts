import type { CompilePreset, CompilePresetId, ProjectType } from './types'

/**
 * Named submission presets, shipped as well-researched defaults. Every field is
 * editable in the Compile dialog before export — house styles vary.
 */
export const COMPILE_PRESETS: Record<CompilePresetId, CompilePreset> = {
  // Standard manuscript format (Shunn) — novels, novellas, short stories.
  shunn: {
    id: 'shunn',
    name: 'Standard Manuscript (Shunn)',
    font: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 2,
    marginInches: 1,
    pageSize: 'us-letter',
    firstLineIndentInches: 0.5,
    titlePage: true,
    runningHeader: true,
    sceneBreak: '#',
    bylineDateline: false,
    chapterHeadings: true
  },
  'nonfiction-proposal': {
    id: 'nonfiction-proposal',
    name: 'Nonfiction Book Proposal',
    font: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 2,
    marginInches: 1,
    pageSize: 'us-letter',
    firstLineIndentInches: 0.5,
    titlePage: true,
    runningHeader: true,
    sceneBreak: '',
    bylineDateline: false,
    chapterHeadings: true
  },
  journalism: {
    id: 'journalism',
    name: 'Journalism (clean body)',
    font: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 2,
    marginInches: 1,
    pageSize: 'us-letter',
    firstLineIndentInches: 0.5,
    titlePage: false,
    runningHeader: false,
    sceneBreak: '',
    bylineDateline: true,
    chapterHeadings: false
  },
  dissertation: {
    id: 'dissertation',
    name: 'Dissertation / Academic',
    font: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 2,
    marginInches: 1,
    pageSize: 'us-letter',
    firstLineIndentInches: 0.5,
    titlePage: true,
    runningHeader: false,
    sceneBreak: '',
    bylineDateline: false,
    chapterHeadings: true
  },
  // Clean business/technical layout — single-spaced, block paragraphs, headings,
  // no title page. Suits documentation, manuals, and SOPs.
  technical: {
    id: 'technical',
    name: 'Technical / Business Document',
    font: 'Times New Roman',
    fontSizePt: 12,
    lineSpacing: 1,
    marginInches: 1,
    pageSize: 'us-letter',
    firstLineIndentInches: 0,
    titlePage: false,
    runningHeader: true,
    sceneBreak: '',
    bylineDateline: false,
    chapterHeadings: true
  }
}

/** The preset that best fits a project type (a starting suggestion). */
export function defaultPresetFor(type: ProjectType): CompilePresetId {
  switch (type) {
    case 'nonfiction-book':
      return 'nonfiction-proposal'
    case 'journalism-short':
    case 'journalism-long':
      return 'journalism'
    case 'dissertation':
      return 'dissertation'
    case 'technical':
    case 'sop':
      return 'technical'
    default:
      return 'shunn'
  }
}
