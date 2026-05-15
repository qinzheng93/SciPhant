import type { Database as SqlJsDatabase } from 'sql.js';
import {
  writeAnalysisFile,
  readAnalysisFile,
  listExistingPaperIds,
} from '../services/analysis-files.js';
import { createAbortControllerManager, summarizePaperCore } from './paper-shared.js';

export const ARXIV_CATEGORY = 'arXiv';

/**
 * Check summary status for a batch of arXiv papers.
 */
export async function checkArxivSummaryStatus(
  dataDir: string,
  paperIds: string[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (paperIds.length === 0) return result;
  const summaryIds = await listExistingPaperIds(dataDir, 'summaries', ARXIV_CATEGORY);
  for (const id of paperIds) {
    result[id] = summaryIds.has(id);
  }
  return result;
}

/**
 * Read full summary content for an arXiv paper.
 */
export async function getArxivSummaryContent(
  dataDir: string,
  paperId: string,
): Promise<string | null> {
  return readAnalysisFile(dataDir, 'summaries', ARXIV_CATEGORY, paperId);
}

const abortMgr = createAbortControllerManager();

export function stopArxivSummary(): { success: boolean } {
  return abortMgr.stop();
}

export function setArxivSummaryAbortController(controller: AbortController | null): void {
  abortMgr.set(controller);
}

export async function summarizeArxivPaper(
  db: SqlJsDatabase,
  settingsDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  dataDir: string,
  paperId: string,
  skipIfAnalyzed = true,
  signal?: AbortSignal,
): Promise<{
  success: boolean;
  summary?: string | null;
  skipped: boolean;
}> {
  const results = db.exec('SELECT id, title, abstract_text FROM papers WHERE id = ?', [paperId]);
  if (results.length === 0 || results[0].values.length === 0) {
    throw new Error(`Paper ${paperId} not found`);
  }
  const row = results[0].values[0];
  const title = row[1] as string;
  const abstractText = row[2] as string;

  return summarizePaperCore(settingsDb, paperTopicsDb, dataDir, ARXIV_CATEGORY, paperId, title, abstractText, skipIfAnalyzed, signal);
}
