import { readFile } from 'fs/promises'
import { parse } from 'yaml'
import { JDSchema } from './types'
import type { JD } from './types'

export async function loadJD(jdPath: string): Promise<JD> {
  const text = await readFile(jdPath, 'utf8')
  const raw = parse(text)
  return JDSchema.parse(raw)
}
