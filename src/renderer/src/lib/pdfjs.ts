import * as pdfjsLib from 'pdfjs-dist'
// Vite bundles the PDF.js worker and gives us a Worker constructor; running it
// as a module worker is the reliable setup under Electron's file:// renderer.
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

let ready = false

/** Lazily configure PDF.js (once) and return the library. */
export function pdfjs(): typeof pdfjsLib {
  if (!ready) {
    pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker()
    ready = true
  }
  return pdfjsLib
}
