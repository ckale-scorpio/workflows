import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import type { JD } from './types';
import { JDSchema } from './types';

export async function loadJD(jdPath: string): Promise<JD> {
  const text = await readFile(jdPath, 'utf8');
  const raw = parse(text);
  return JDSchema.parse(raw);
}
