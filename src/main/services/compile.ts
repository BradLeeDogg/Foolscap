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
import archiver from 'archiver'
import { randomUUID } from 'crypto'
import type { CompilePreset, CompileRequest, ProseMirrorNode } from '@shared/types'
import { SCREENPLAY_ELEMENTS, SCREENPLAY_STYLES, isScreenplayElement } from '@shared/screenplay'
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
  fns: FootnoteStore,
  fmt?: { upper?: boolean; bold?: boolean; italics?: boolean }
): (TextRun | FootnoteReferenceRun)[] {
  const runs: (TextRun | FootnoteReferenceRun)[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'text' && typeof n.text === 'string') {
      const marks = (n.marks ?? []).map((m) => m.type)
      if (marks.includes('deletion')) continue // resolved-out suggestion
      runs.push(
        new TextRun({
          text: fmt?.upper ? n.text.toUpperCase() : n.text,
          bold: marks.includes('bold') || fmt?.bold,
          italics: marks.includes('italic') || fmt?.italics,
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
      case 'paragraph': {
        const sp = node.attrs?.sp
        if (isScreenplayElement(sp)) {
          const st = SCREENPLAY_STYLES[sp]
          out.push(
            new Paragraph({
              children: inlineRuns(node.content, fns, {
                upper: st.upper,
                bold: st.bold,
                italics: st.italic
              }),
              spacing: bodySpacing(preset),
              alignment: st.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
              indent: {
                left: convertInchesToTwip(st.leftIn),
                right: convertInchesToTwip(st.rightIn)
              }
            })
          )
        } else {
          out.push(
            new Paragraph({ children: inlineRuns(node.content, fns), spacing: bodySpacing(preset), indent })
          )
        }
        break
      }
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

// --- HTML + PDF -------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineHtml(nodes: ProseMirrorNode[] | undefined, notes: string[]): string {
  let html = ''
  for (const n of nodes ?? []) {
    if (n.type === 'text' && typeof n.text === 'string') {
      const marks = (n.marks ?? []).map((m) => m.type)
      if (marks.includes('deletion')) continue // resolved-out suggestion
      let t = esc(n.text)
      if (marks.includes('bold')) t = `<strong>${t}</strong>`
      if (marks.includes('italic')) t = `<em>${t}</em>`
      if (marks.includes('underline')) t = `<u>${t}</u>`
      html += t
    } else if (n.type === 'footnote') {
      notes.push(String((n.attrs?.content as string) ?? ''))
      html += `<sup class="fn">[${notes.length}]</sup>`
    } else if (n.type === 'hardBreak') {
      html += '<br>'
    }
  }
  return html
}

function blockHtml(content: ProseMirrorNode[] | undefined, notes: string[]): string {
  let html = ''
  for (const node of content ?? []) {
    switch (node.type) {
      case 'paragraph': {
        const sp = node.attrs?.sp
        const cls = isScreenplayElement(sp) ? ` class="sp sp-${sp}"` : ''
        html += `<p${cls}>${inlineHtml(node.content, notes)}</p>`
        break
      }
      case 'heading':
        html += `<h2>${inlineHtml(node.content, notes)}</h2>`
        break
      case 'blockquote':
        html += `<blockquote>${blockHtml(node.content, notes)}</blockquote>`
        break
      case 'bulletList':
      case 'orderedList': {
        const tag = node.type === 'orderedList' ? 'ol' : 'ul'
        html += `<${tag}>`
        for (const li of node.content ?? []) html += `<li>${blockHtml(li.content, notes)}</li>`
        html += `</${tag}>`
        break
      }
      default:
        break
    }
  }
  return html
}

/** Render the compiled manuscript as a styled HTML document (used for PDF). */
export async function compileToHtml(root: string, req: CompileRequest): Promise<string> {
  const { preset, meta } = req
  const notes: string[] = []
  const contents: Record<string, { doc?: ProseMirrorNode } | null> = {}
  let totalWords = 0
  for (const e of req.entries) {
    if (e.docId && !(e.docId in contents)) {
      const c = await readDocument(root, e.docId)
      contents[e.docId] = c as never
      if (c) totalWords += countWords(c)
    }
  }
  const roundedWords = Math.max(100, Math.round(totalWords / 100) * 100)

  let body = ''
  if (preset.titlePage) {
    body += `<div class="title-page"><div class="contact">${esc(meta.contact).replace(/\n/g, '<br>')}</div>`
    body += `<div class="wc">about ${roundedWords.toLocaleString()} words</div>`
    body += `<div class="title">${esc(meta.title.toUpperCase())}</div>`
    if (meta.author) body += `<div class="byauthor">by ${esc(meta.author)}</div></div>`
    else body += '</div>'
  }
  if (preset.bylineDateline) {
    if (meta.byline) body += `<p class="byline">By ${esc(meta.byline)}</p>`
    if (meta.dateline) body += `<p class="dateline">${esc(meta.dateline)}</p>`
  }

  let prevWasDoc = false
  for (const e of req.entries) {
    if (e.heading && preset.chapterHeadings) {
      body += `<h1 class="chapter">${esc(e.heading)}</h1>`
      prevWasDoc = false
    } else if (e.docId) {
      if (prevWasDoc && preset.sceneBreak) body += `<p class="scene-break">${esc(preset.sceneBreak)}</p>`
      body += blockHtml(contents[e.docId]?.doc?.content, notes)
      prevWasDoc = true
    }
  }

  if (notes.length) {
    body += '<div class="endnotes"><h2>Notes</h2><ol>'
    for (const n of notes) body += `<li>${esc(n)}</li>`
    body += '</ol></div>'
  }

  const indent = preset.firstLineIndentInches
  const spCss = SCREENPLAY_ELEMENTS.map((k) => {
    const s = SCREENPLAY_STYLES[k]
    return `p.sp-${k}{margin-left:${s.leftIn}in;margin-right:${s.rightIn}in;text-align:${s.align};${
      s.upper ? 'text-transform:uppercase;' : ''
    }${s.bold ? 'font-weight:700;' : ''}${s.italic ? 'font-style:italic;' : ''}}`
  }).join('\n')
  const css = `
    body { font-family: '${preset.font}', Times, serif; font-size: ${preset.fontSizePt}pt; line-height: ${preset.lineSpacing}; color: #000; }
    p { margin: 0; text-indent: ${indent}in; }
    p.sp { text-indent: 0; font-family: 'Courier New', Courier, monospace; white-space: pre-wrap; }
    ${spCss}
    p.scene-break, .title-page .title, .byauthor, .wc { text-indent: 0; }
    h1.chapter { page-break-before: always; text-align: center; margin: 2in 0 1in; font-size: ${preset.fontSizePt + 2}pt; }
    h2 { text-indent: 0; font-size: ${preset.fontSizePt}pt; }
    blockquote { margin: 0 0 0 0.5in; }
    .scene-break { text-align: center; }
    .title-page { height: 9in; page-break-after: always; position: relative; }
    .title-page .contact { white-space: pre-line; }
    .title-page .wc { position: absolute; top: 0; right: 0; }
    .title-page .title { text-align: center; margin-top: 3in; }
    .byauthor { text-align: center; }
    sup.fn { font-size: 0.7em; }
    .endnotes { page-break-before: always; }
  `
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`
}

/** Render compiled HTML to a PDF buffer using an offscreen window + printToPDF. */
export async function compileToPdfBuffer(root: string, req: CompileRequest): Promise<Buffer> {
  const { BrowserWindow } = await import('electron')
  const html = await compileToHtml(root, req)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, offscreen: true } })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const m = req.preset.marginInches
    const data = await win.webContents.printToPDF({
      pageSize: req.preset.pageSize === 'a4' ? 'A4' : 'Letter',
      margins: { top: m, bottom: m, left: m, right: m },
      printBackground: false
    })
    return data
  } finally {
    win.destroy()
  }
}

export async function compileToPdfFile(
  root: string,
  req: CompileRequest,
  outPath: string
): Promise<void> {
  const buffer = await compileToPdfBuffer(root, req)
  await writeFileAtomic(outPath, buffer)
}

// --- Markdown / plain text ---------------------------------------------------

function inlinePlain(nodes: ProseMirrorNode[] | undefined, notes: string[], md: boolean): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'text' && typeof n.text === 'string') {
      const marks = (n.marks ?? []).map((m) => m.type)
      if (marks.includes('deletion')) continue
      let t = n.text
      if (md) {
        if (marks.includes('bold')) t = `**${t}**`
        if (marks.includes('italic')) t = `*${t}*`
        if (marks.includes('underline')) t = `<u>${t}</u>`
      }
      out += t
    } else if (n.type === 'footnote') {
      notes.push(String((n.attrs?.content as string) ?? ''))
      out += md ? `[^${notes.length}]` : `[${notes.length}]`
    } else if (n.type === 'hardBreak') {
      out += md ? '  \n' : '\n'
    }
  }
  return out
}

function blockPlain(content: ProseMirrorNode[] | undefined, notes: string[], md: boolean): string {
  let out = ''
  for (const node of content ?? []) {
    switch (node.type) {
      case 'paragraph':
        out += inlinePlain(node.content, notes, md) + '\n\n'
        break
      case 'heading': {
        const lvl = Number(node.attrs?.level) || 2
        const txt = inlinePlain(node.content, notes, md)
        out += (md ? `${'#'.repeat(lvl)} ${txt}` : txt) + '\n\n'
        break
      }
      case 'blockquote':
        for (const child of node.content ?? []) {
          out += (md ? '> ' : '    ') + inlinePlain(child.content, notes, md) + '\n'
        }
        out += '\n'
        break
      case 'bulletList':
      case 'orderedList': {
        let i = 1
        for (const li of node.content ?? []) {
          const para = (li.content ?? [])[0]
          const prefix = node.type === 'orderedList' ? `${i++}. ` : '- '
          out += prefix + inlinePlain(para?.content, notes, md) + '\n'
        }
        out += '\n'
        break
      }
      default:
        break
    }
  }
  return out
}

async function assemblePlain(root: string, req: CompileRequest, md: boolean): Promise<string> {
  const { preset, meta } = req
  const notes: string[] = []
  let out = ''
  if (meta.title) out += (md ? `# ${meta.title}` : meta.title) + '\n\n'
  if (meta.author) out += (md ? `*by ${meta.author}*` : `by ${meta.author}`) + '\n\n'
  let prevDoc = false
  for (const e of req.entries) {
    if (e.heading) {
      out += (md ? `# ${e.heading}` : e.heading.toUpperCase()) + '\n\n'
      prevDoc = false
    } else if (e.docId) {
      if (prevDoc && preset.sceneBreak) out += `${preset.sceneBreak}\n\n`
      const c = await readDocument(root, e.docId)
      out += blockPlain(c?.doc?.content, notes, md)
      prevDoc = true
    }
  }
  if (notes.length) {
    out += md ? '\n' : '\nNotes\n'
    notes.forEach((n, i) => {
      out += (md ? `[^${i + 1}]: ${n}` : `[${i + 1}] ${n}`) + '\n'
    })
  }
  return out.trimEnd() + '\n'
}

export function compileToMarkdown(root: string, req: CompileRequest): Promise<string> {
  return assemblePlain(root, req, true)
}
export function compileToText(root: string, req: CompileRequest): Promise<string> {
  return assemblePlain(root, req, false)
}

// --- ePub (hand-rolled EPUB 3 via archiver) ---------------------------------

interface EpubChapter {
  title: string
  xhtml: string
}

/** XHTML needs void elements closed; close <br> and <hr> emitted by the HTML pass. */
function xhtmlSafe(html: string): string {
  return html.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>')
}

function buildChapters(req: CompileRequest, contents: Record<string, { doc?: ProseMirrorNode } | null>): EpubChapter[] {
  const chapters: EpubChapter[] = []
  let current: EpubChapter | null = null
  const ensure = (title: string): void => {
    current = { title, xhtml: '' }
    chapters.push(current)
  }
  for (const e of req.entries) {
    if (e.heading) {
      ensure(e.heading)
    } else if (e.docId) {
      if (!current) ensure(req.meta.title || 'Text')
      const notes: string[] = []
      let html = blockHtml(contents[e.docId]?.doc?.content, notes)
      if (notes.length) {
        html +=
          '<hr/><section class="notes"><h3>Notes</h3><ol>' +
          notes.map((n) => `<li>${esc(n)}</li>`).join('') +
          '</ol></section>'
      }
      current!.xhtml += xhtmlSafe(html)
    }
  }
  return chapters
}

function zipToBuffer(add: (a: archiver.Archiver) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('data', (d: Buffer) => chunks.push(d))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    add(archive)
    void archive.finalize()
  })
}

export async function compileToEpubBuffer(root: string, req: CompileRequest): Promise<Buffer> {
  const { meta } = req
  const contents: Record<string, { doc?: ProseMirrorNode } | null> = {}
  for (const e of req.entries) {
    if (e.docId && !(e.docId in contents)) contents[e.docId] = (await readDocument(root, e.docId)) as never
  }
  const chapters = buildChapters(req, contents)
  const uuid = randomUUID()
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const title = esc(meta.title || 'Untitled')
  const author = esc(meta.author || 'Unknown')

  const page = (body: string, t: string): string =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${t}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`

  const titlePage = page(
    `<div class="title-page"><h1>${title}</h1><p class="author">${author}</p></div>`,
    title
  )
  const navItems = chapters.map((c, i) => `<li><a href="ch${i}.xhtml">${esc(c.title)}</a></li>`).join('')
  const nav =
    `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title></head>` +
    `<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems}</ol></nav></body></html>`
  const ncx =
    `<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:${uuid}"/></head>` +
    `<docTitle><text>${title}</text></docTitle><navMap>` +
    chapters
      .map(
        (c, i) =>
          `<navPoint id="np${i}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="ch${i}.xhtml"/></navPoint>`
      )
      .join('') +
    `</navMap></ncx>`

  const manifestItems = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>',
    ...chapters.map((_, i) => `<item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`)
  ].join('')
  const spine = ['<itemref idref="title"/>', ...chapters.map((_, i) => `<itemref idref="ch${i}"/>`)].join('')
  const opf =
    `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>en-US</dc:language>` +
    `<meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifestItems}</manifest><spine toc="ncx">${spine}</spine></package>`

  const css = `body{font-family:'${req.preset.font}',Georgia,serif;line-height:${req.preset.lineSpacing};} h1,h2,h3{font-weight:600;} p{margin:0;text-indent:${req.preset.firstLineIndentInches}in;} p:first-of-type{text-indent:0;} .title-page{text-align:center;margin-top:25%;} .title-page .author{margin-top:2em;font-style:italic;} .notes{font-size:0.9em;}`
  const container = `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`

  return zipToBuffer((a) => {
    // mimetype MUST be first and stored uncompressed.
    a.append('application/epub+zip', { name: 'mimetype', store: true })
    a.append(container, { name: 'META-INF/container.xml' })
    a.append(opf, { name: 'OEBPS/content.opf' })
    a.append(nav, { name: 'OEBPS/nav.xhtml' })
    a.append(ncx, { name: 'OEBPS/toc.ncx' })
    a.append(css, { name: 'OEBPS/style.css' })
    a.append(titlePage, { name: 'OEBPS/title.xhtml' })
    chapters.forEach((c, i) =>
      a.append(page(`<h1>${esc(c.title)}</h1>${c.xhtml}`, esc(c.title)), { name: `OEBPS/ch${i}.xhtml` })
    )
  })
}

export async function compileToEpubFile(
  root: string,
  req: CompileRequest,
  outPath: string
): Promise<void> {
  await writeFileAtomic(outPath, await compileToEpubBuffer(root, req))
}
