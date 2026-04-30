import { readFile } from 'node:fs/promises';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (
  buf: Buffer,
  opts?: { version?: string },
) => Promise<{ text: string }>;

export async function parsePDF(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  try {
    const result = await pdfParse(buf);
    return result.text.trim();
  } catch (_err) {
    // Retry with the newer bundled pdfjs; some PDFs with embedded binary font
    // data trigger "Command token too long" in the default (v1.10.100) bundle.
    const result = await pdfParse(buf, { version: 'v2.0.550' });
    return result.text.trim();
  }
}
