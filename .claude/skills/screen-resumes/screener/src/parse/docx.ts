import { readFile } from 'fs/promises'
import mammoth from 'mammoth'

export async function parseDOCX(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  const result = await mammoth.extractRawText({ buffer: buf })
  return result.value.trim()
}
