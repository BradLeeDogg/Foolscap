import {
  AlignmentType,
  Document,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  LineRuleType,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip
} from 'docx'
import type { CompilePreset, CompileRequest, ProseMirrorNode } from '@shared/types'
import { countWords, readDocument } from './documents'
import { writeFileAtomic } from './atomic'

const PAGE_SIZES = {
  'us-letter': { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 }
}

interface FootnoteStore {
  next: number
  map: Record<number, { children: Paragraph[] }>
}

function inlineRuns(
  nodes: ProseMirrorNode[] | undefined,
  fns: FootnoteStore
): (TextRun | FootnoteReferenceRun)[] {
  const runs: (TextRun | FootnoteReferenceRun)[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'text' && typeof n.text === 'string') {
      const marks = (n.marks ?? []).map((m) => m.type)
      runs.push(
        new TextRun({
          text: n.text,
          bold: marks.includes('bold'),
          italics: marks.includes('italic'),
          underline: marks.includes('underline') ? {} : undefined
        })
      )
    } else if (n.type === 'footnote') {
      const id = ++fns.next
      const content = String((n.attrs?.content as string) ?? '')
      fns.map[id] = { children: [new Paragraph({ children: [new TextRun(content)] })] }
      runs.push(new FootnoteReferenceRun(id))
    } else if (n.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }))
    }
  }
  return runs
}

function bodySpacing(preset: CompilePreset): { line: number; lineRule: (typeof LineRuleType)[keyof typeof LineRuleType]; after: number } {
  return { line: Math.round(preset.lineSpacing * 240), lineRule: LineRuleType.AUTO, after: 0 }
}

function blockParagraphs(
  content: ProseMirrorNode[] | undefined,
  preset: CompilePreset,
  fns: FootnoteStore
): Paragraph[] {
  const out: Paragraph[] = []
  const indent = { firstLine: convertInchesToTwip(preset.firstLineIndentInches) }
  for (const node of content ?? []) {
    switch (node.type) {
      case 'paragraph':
        out.push(
          new Paragraph({ children: inlineRuns(node.content, fns), spacing: bodySpacing(preset), indent })
        )
        break
      case 'heading':
        out.push(
          new Paragraph({
            children: inlineRuns(node.content, fns),
            heading: HeadingLevel.HEADING_2,
            spacing: { ...bodySpacing(preset), before: 240 }
          })
        )
        break
      case 'blockquote':
        for (const child of node.content ?? []) {
          out.push(
            new Paragraph({
              children: inlineRuns(child.content, fns),
              spacing: bodySpacing(preset),
              indent: { left: convertInchesToTwip(0.5) }
            })
          )
        }
        break
      case 'bulletList':
      case 'orderedList': {
        let i = 1
        for (const li of node.content ?? []) {
          const prefix = node.type === 'orderedList' ? `${i++}. ` : '• '
          const para = (li.content ?? [])[0]
          out.push(
            new Paragraph({
              children: [new TextRun(prefix), ...inlineRuns(para?.content, fns)],
              spacing: bodySpacing(preset),
              indent: { left: convertInchesToTwip(0.5) }
            })
          )
        }
        break
      }
      default:
        break
    }
  }
  return out
}

function center(text: string, preset: CompilePreset): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun(text)],
    spacing: bodySpacing(preset)
  })
}

function buildTitlePage(req: CompileRequest, roundedWords: number, preset: CompilePreset): Paragraph[] {
  const { meta } = req
  const paras: Paragraph[] = []
  for (const line of meta.contact.split('\n')) paras.push(new Paragraph({ children: [new TextRun(line)] }))
  paras.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun(`about ${roundedWords.toLocaleString()} words`)]
    })
  )
  for (let i = 0; i < 10; i++) paras.push(new Paragraph({ children: [new TextRun('')] }))
  paras.push(center(meta.title.toUpperCase(), preset))
  if (meta.author) paras.push(center(`by ${meta.author}`, preset))
  paras.push(new Paragraph({ children: [new PageBreak()] }))
  return paras
}

/** Build a finished manuscript .docx from the compile request. Non-destructive. */
export async function compileToDocxBuffer(root: string, req: CompileRequest): Promise<Buffer> {
  const { preset, meta } = req
  const fns: FootnoteStore = { next: 0, map: {} }

  // Pre-read all document contents and tally words.
  const contents: Record<string, ReturnType<typeof Object> | null> = {}
  let totalWords = 0
  for (const e of req.entries) {
    if (e.docId && !(e.docId in contents)) {
      const c = await readDocument(root, e.docId)
      contents[e.docId] = c as never
      if (c) totalWords += countWords(c)
    }
  }
  const roundedWords = Math.max(100, Math.round(totalWords / 100) * 100)

  const body: Paragraph[] = []
  if (preset.bylineDateline) {
    if (meta.byline) body.push(new Paragraph({ children: [new TextRun(`By ${meta.byline}`)] }))
    if (meta.dateline) body.push(new Paragraph({ children: [new TextRun(meta.dateline)] }))
  }

  let prevWasDoc = false
  for (const e of req.entries) {
    if (e.heading && preset.chapterHeadings) {
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          children: [new TextRun(e.heading)],
          pageBreakBefore: true,
          spacing: { before: 480, after: 240, line: Math.round(preset.lineSpacing * 240), lineRule: LineRuleType.AUTO }
        })
      )
      prevWasDoc = false
    } else if (e.docId) {
      if (prevWasDoc && preset.sceneBreak) body.push(center(preset.sceneBreak, preset))
      const c = contents[e.docId] as { doc?: ProseMirrorNode } | null
      body.push(...blockParagraphs(c?.doc?.content, preset, fns))
      prevWasDoc = true
    }
  }

  const surname = meta.author.trim().split(/\s+/).pop() ?? meta.author
  const runningHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun(`${surname} / ${meta.keyword || meta.title} / `),
          new TextRun({ children: [PageNumber.CURRENT] })
        ]
      })
    ]
  })
  const blankHeader = new Header({ children: [new Paragraph({ children: [new TextRun('')] })] })

  const size = PAGE_SIZES[preset.pageSize]
  const margin = convertInchesToTwip(preset.marginInches)

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: preset.font, size: preset.fontSizePt * 2 } }
      }
    },
    footnotes: fns.map,
    sections: [
      {
        properties: {
          titlePage: preset.titlePage,
          page: {
            size: { width: size.width, height: size.height },
            margin: { top: margin, bottom: margin, left: margin, right: margin }
          }
        },
        headers: preset.runningHeader ? { default: runningHeader, first: blankHeader } : undefined,
        children: [...(preset.titlePage ? buildTitlePage(req, roundedWords, preset) : []), ...body]
      }
    ]
  })

  return Packer.toBuffer(doc)
}

export async function compileToDocxFile(
  root: string,
  req: CompileRequest,
  outPath: string
): Promise<void> {
  const buffer = await compileToDocxBuffer(root, req)
  await writeFileAtomic(outPath, buffer)
}
