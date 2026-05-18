import type { Database as SqlJsDatabase } from 'sql.js';
import {
  readAnalysisFile,
  listExistingPaperIds,
} from '../services/analysis-files.js';
import { createAbortControllerManager, summarizePaperCore } from './paper-shared.js';
import { buildConferenceCategory } from './conference-paper.js';
import { getCategoryForConference } from './conference-paper.js';

/**
 * Check summary status for a batch of conference papers.
 */
export async function checkConferenceSummaryStatus(
  conferenceDb: SqlJsDatabase,
  dataDir: string,
  paperIds: string[],
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (paperIds.length === 0) return result;

  const placeholders = paperIds.map(() => '?').join(',');
  const results = conferenceDb.exec(
    `SELECT id, conference_id FROM papers WHERE id IN (${placeholders})`,
    paperIds,
  );
  if (results.length === 0) return result;

  const paperConfMap = new Map<string, number>();
  const confIds = new Set<number>();
  for (const row of results[0].values) {
    paperConfMap.set(row[0] as string, row[1] as number);
    confIds.add(row[1] as number);
  }

  const categoryCache = new Map<number, string>();
  for (const confId of Array.from(confIds)) {
    const confResults = conferenceDb.exec(
      'SELECT short_name, year FROM conferences WHERE id = ?',
      [confId],
    );
    if (confResults.length > 0 && confResults[0].values.length > 0) {
      categoryCache.set(confId, buildConferenceCategory(confResults[0].values[0][0] as string, confResults[0].values[0][1] as number));
    }
  }

  const summaryIdsByCategory = new Map<string, Set<string>>();
  for (const category of Array.from(new Set(categoryCache.values()))) {
    if (!summaryIdsByCategory.has(category)) {
      summaryIdsByCategory.set(category, await listExistingPaperIds(dataDir, 'summaries', category));
    }
  }

  for (const id of paperIds) {
    const confId = paperConfMap.get(id);
    if (!confId) { result[id] = false; continue; }
    const category = categoryCache.get(confId);
    if (!category) { result[id] = false; continue; }
    const summaryIds = summaryIdsByCategory.get(category)!;
    result[id] = summaryIds.has(id);
  }
  return result;
}

/**
 * Read full summary content for a conference paper.
 */
export async function getConferenceSummaryContent(
  conferenceDb: SqlJsDatabase,
  dataDir: string,
  paperId: string,
): Promise<string | null> {
  const category = getCategoryForConference(conferenceDb, paperId);
  if (!category) return null;
  return readAnalysisFile(dataDir, 'summaries', category, paperId);
}

const abortMgr = createAbortControllerManager();

export function stopConferenceSummary(): { success: boolean } {
  return abortMgr.stop();
}

export function setConferenceSummaryAbortController(controller: AbortController | null): void {
  abortMgr.set(controller);
}

export async function summarizeConferencePaper(
  conferenceDb: SqlJsDatabase,
  settingsDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase | null,
  dataDir: string,
  paperId: string,
  skipIfAnalyzed = true,
  signal?: AbortSignal,
): Promise<{ success: boolean; summary?: string | null; skipped: boolean }> {
  const category = getCategoryForConference(conferenceDb, paperId);
  if (!category) throw new Error(`Conference category not found for paper ${paperId}`);

  const results = conferenceDb.exec(
    'SELECT id, title, abstract FROM papers WHERE id = ?',
    [paperId],
  );
  if (results.length === 0 || results[0].values.length === 0) {
    throw new Error(`Conference paper ${paperId} not found`);
  }
  const row = results[0].values[0];
  const title = row[1] as string;
  const abstractText = row[2] as string;

  return summarizePaperCore(settingsDb, paperTopicsDb, dataDir, category, paperId, title, abstractText, skipIfAnalyzed, signal);
}
