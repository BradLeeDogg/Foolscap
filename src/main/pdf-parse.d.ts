// pdf-parse ships its types for the package root only; we import the inner
// module directly to skip its debug self-test in index.js.
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages: number
    info: unknown
    metadata: unknown
    version: string
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>
  export = pdfParse
}
