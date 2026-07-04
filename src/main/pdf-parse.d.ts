// pdf-parse ships its types for the package root only; we import the inner
// module directly to skip its debug self-test in index.js.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfTextItem {
    str: string
    transform: number[]
    height: number
    width: number
    fontName: string
  }
  interface PdfPageData {
    getTextContent(opts?: {
      normalizeWhitespace?: boolean
      disableCombineTextItems?: boolean
    }): Promise<{ items: PdfTextItem[] }>
  }
  interface PdfParseOptions {
    pagerender?: (page: PdfPageData) => Promise<string> | string
    max?: number
    version?: string
  }
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(data: Buffer | Uint8Array, options?: PdfParseOptions): Promise<PdfParseResult>
  export = pdfParse
}
