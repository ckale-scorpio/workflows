import { readFile } from 'fs/promises'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>

export async function parsePDF(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  const result = await pdfParse(buf)
  return result.text.trim()
}
