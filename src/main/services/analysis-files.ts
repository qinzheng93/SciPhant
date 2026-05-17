import { mkdir, writeFile, readFile, readdir, rm, rename } from 'fs/promises';
import { join } from 'path';

export type AnalysisType = 'summaries' | 'analyses';

/**
 * Build the full file path for a summary or analysis file.
 */
export function buildFilePath(
  dataDir: string,
  type: AnalysisType,
  category: string,
  paperId: string,
): string {
  return join(dataDir, type, category, `${paperId}.md`);
}

/**
 * Write content to a summary/analysis file. Uses atomic write (tmp + rename).
 */
export async function writeAnalysisFile(
  dataDir: string,
  type: AnalysisType,
  category: string,
  paperId: string,
  content: string,
): Promise<void> {
  const filePath = buildFilePath(dataDir, type, category, paperId);
  const dir = join(dataDir, type, category);
  await mkdir(dir, { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}

/**
 * Read a summary/analysis file. Returns null if file does not exist.
 */
export async function readAnalysisFile(
  dataDir: string,
  type: AnalysisType,
  category: string,
  paperId: string,
): Promise<string | null> {
  const filePath = buildFilePath(dataDir, type, category, paperId);
  try {
    return await readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'ENOENT') {
      return null;
    }
    throw e;
  }
}

/**
 * Delete a summary/analysis file.
 */
export async function deleteAnalysisFile(
  dataDir: string,
  type: AnalysisType,
  category: string,
  paperId: string,
): Promise<void> {
  const filePath = buildFilePath(dataDir, type, category, paperId);
  await rm(filePath, { force: true });
}

/**
 * List all paper IDs that have a file in the given category directory.
 */
export async function listExistingPaperIds(
  dataDir: string,
  type: AnalysisType,
  category: string,
): Promise<Set<string>> {
  const dir = join(dataDir, type, category);
  try {
    const files = await readdir(dir);
    const ids = new Set<string>();
    for (const f of files) {
      if (f.endsWith('.md')) {
        ids.add(f.slice(0, -3)); // strip .md
      }
    }
    return ids;
  } catch (e: unknown) {
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'ENOENT') {
      return new Set();
    }
    throw e;
  }
}

/**
 * Clear all summary/analysis files. If type is specified, only clear that type.
 */
export async function clearAllAnalysisFiles(
  dataDir: string,
  type?: AnalysisType,
): Promise<void> {
  if (type) {
    await rm(join(dataDir, type), { recursive: true, force: true });
  } else {
    await rm(join(dataDir, 'summaries'), { recursive: true, force: true }).catch(() => {});
    await rm(join(dataDir, 'analyses'), { recursive: true, force: true }).catch(() => {});
  }
}
