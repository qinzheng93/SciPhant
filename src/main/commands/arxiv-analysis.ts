import type { Database as SqlJsDatabase } from 'sql.js';
import { ARXIV_CATEGORY } from './arxiv-summary.js';
import { createAbortControllerManager, analyzeFullPaperCore, getPaperAnalysisContent, type ProgressCallback } from './paper-shared.js';

const abortMgr = createAbortControllerManager();

export function setArxivAnalysisAbortController(controller: AbortController | null): void {
  abortMgr.set(controller);
}

export function stopArxivAnalysis(): { success: boolean } {
  return abortMgr.stop();
}

export async function analyzeArxivFullPaper(
  db: SqlJsDatabase,
  settingsDb: SqlJsDatabase,
  dataDir: string,
  paperId: string,
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; result?: import('../services/llm-client.js').DeepAnalysisResult }> {
  const results = db.exec('SELECT title, pdf_url FROM papers WHERE id = ?', [paperId]);
  if (results.length === 0 || results[0].values.length === 0) {
    throw new Error(`Paper ${paperId} not found`);
  }
  const title = results[0].values[0][0] as string;
  const pdfUrl = results[0].values[0][1] as string;

  return analyzeFullPaperCore(settingsDb, dataDir, ARXIV_CATEGORY, paperId, title, pdfUrl, signal, onProgress);
}

export async function getArxivPaperAnalysis(
  dataDir: string,
  paperId: string,
): Promise<string | null> {
  return getPaperAnalysisContent(dataDir, ARXIV_CATEGORY, paperId);
}
