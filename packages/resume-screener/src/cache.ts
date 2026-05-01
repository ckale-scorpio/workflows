import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function hashBuffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

export function hashString(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

export async function hashFile(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return hashBuffer(buf);
}

async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function getCachedText(workspace: string, fileHash: string): Promise<string | null> {
  const p = path.join(workspace, '.cache', 'text', `${fileHash}.txt`);
  if (!existsSync(p)) return null;
  return readFile(p, 'utf8');
}

export async function setCachedText(
  workspace: string,
  fileHash: string,
  text: string,
): Promise<void> {
  const dir = path.join(workspace, '.cache', 'text');
  await ensureDir(dir);
  await writeFile(path.join(dir, `${fileHash}.txt`), text, 'utf8');
}

export async function getCachedExtract(
  workspace: string,
  textHash: string,
  promptVersion: string,
): Promise<object | null> {
  const p = path.join(workspace, '.cache', 'extract', `${textHash}-${promptVersion}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(await readFile(p, 'utf8'));
}

export async function setCachedExtract(
  workspace: string,
  textHash: string,
  promptVersion: string,
  data: object,
): Promise<void> {
  const dir = path.join(workspace, '.cache', 'extract');
  await ensureDir(dir);
  await writeFile(
    path.join(dir, `${textHash}-${promptVersion}.json`),
    JSON.stringify(data, null, 2),
    'utf8',
  );
}

export async function listCachedExtracts(workspace: string): Promise<object[]> {
  const dir = path.join(workspace, '.cache', 'extract');
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const results: object[] = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    try {
      results.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
    } catch {
      // skip corrupt cache files
    }
  }
  return results;
}
