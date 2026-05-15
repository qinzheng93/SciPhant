import type { Database as SqlJsDatabase } from 'sql.js';
import { getCategoryForConference } from './conference-summary.js';
import { createAbortControllerManager, analyzeFullPaperCore, getPaperAnalysisContent, type ProgressCallback } from './paper-shared.js';

const abortMgr = createAbortControllerManager();

export function stopConferenceAnalysis(): { success: boolean } {
  return abortMgr.stop();
}

export function setConferenceAnalysisAbortController(controller: AbortController | null): void {
  abortMgr.set(controller);
}

export async function analyzeConferenceFullPaper(
  conferenceDb: SqlJsDatabase,
  settingsDb: SqlJsDatabase,
  dataDir: string,
  paperId: string,
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; result?: import('../services/llm-client.js').DeepAnalysisResult }> {
  const category = getCategoryForConference(conferenceDb, paperId);
  if (!category) throw new Error(`Conference category not found for paper ${paperId}`);

  const results = conferenceDb.exec('SELECT title, pdf_url FROM papers WHERE id = ?', [paperId]);
  if (results.length === 0 || results[0].values.length === 0) {
    throw new Error(`Conference paper ${paperId} not found`);
  }
  const title = results[0].values[0][0] as string;
  const pdfUrl = results[0].values[0][1] as string;

  return analyzeFullPaperCore(settingsDb, dataDir, category, paperId, title, pdfUrl, signal, onProgress);
}

export async function getConferencePaperAnalysis(
  conferenceDb: SqlJsDatabase,
  dataDir: string,
  paperId: string,
): Promise<string | null> {
  const category = getCategoryForConference(conferenceDb, paperId);
  return getPaperAnalysisContent(dataDir, category, paperId);
}
