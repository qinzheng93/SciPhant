import type { Database as SqlJsDatabase } from 'sql.js';
import type { Paper } from './arxiv-paper.js';
import type { DeepAnalysisResult } from '../services/llm-client.js';
import { LLMClient } from '../services/llm-client.js';
import { loadLLMConfig } from './config.js';
import { extractTextFromUrl } from '../services/pdf-extractor.js';
import { writeAnalysisFile, readAnalysisFile } from '../services/analysis-files.js';

export const BASE_SQL = `SELECT
    p.id, p.title, p.authors, p.abstract_text, p.url, p.pdf_url,
    p.published_date, p.updated_date, p.categories, p.fetched_at
FROM papers p`;

export function rowToPaper(row: Record<string, unknown>): Paper {
  return {
    ...row,
    authors: JSON.parse(row.authors as string),
    categories: JSON.parse(row.categories as string),
  } as Paper;
}

export function execResultToPaperRows(results: { columns: string[]; values: unknown[][] }): Record<string, unknown>[] {
  return results.values.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < results.columns.length; i++) {
      obj[results.columns[i]] = row[i];
    }
    return obj;
  });
}
export type ProgressCallback = (phase: string) => void;

export function createAbortControllerManager() {
  let controller: AbortController | null = null;
  return {
    set: (c: AbortController | null) => { controller = c; },
    stop: (): { success: boolean } => {
      if (controller) {
        controller.abort();
        controller = null;
      }
      return { success: true };
    },
    get: () => controller,
  };
}

export function loadEnabledTopicNames(paperTopicsDb: SqlJsDatabase): string[] {
  const topicRows = paperTopicsDb.exec('SELECT id, name, keywords, enabled FROM topics WHERE enabled = TRUE');
  const allTopics = topicRows.length > 0
    ? topicRows[0].values.map(row => ({
      id: row[0] as number,
      name: row[1] as string,
      keywords: JSON.parse(row[2] as string),
      enabled: Boolean(row[3]),
    }))
    : [];
  return allTopics.map(t => t.name);
}

export function createLLMClient(settingsDb: SqlJsDatabase): LLMClient {
  const config = loadLLMConfig(settingsDb);
  return new LLMClient(config.api_key, config.model, config.base_url, config.temperature);
}

export function buildSearchPattern(search: string): string {
  const escaped = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

export async function analyzeFullPaperCore(
  settingsDb: SqlJsDatabase,
  dataDir: string,
  category: string,
  paperId: string,
  title: string,
  pdfUrl: string,
  signal?: AbortSignal,
  onProgress?: ProgressCallback,
): Promise<{ success: boolean; result?: DeepAnalysisResult }> {
  if (!pdfUrl) {
    throw new Error(`Paper ${paperId} has no PDF URL`);
  }

  const fullText = await extractTextFromUrl(pdfUrl, signal, dataDir, onProgress);

  if (!fullText.trim()) {
    throw new Error('Failed to extract text from PDF');
  }

  onProgress?.('分析中');
  const client = createLLMClient(settingsDb);
  const analysisResult = await client.analyzeFullPaper(title, fullText, signal);

  await writeAnalysisFile(dataDir, 'analyses', category, paperId, `# ${title}\n\n${analysisResult.analysis}`);

  return { success: true, result: analysisResult };
}

export async function getPaperAnalysisContent(
  dataDir: string,
  category: string | null,
  paperId: string,
): Promise<string | null> {
  if (!category) return null;
  return readAnalysisFile(dataDir, 'analyses', category, paperId);
}

export async function summarizePaperCore(
  settingsDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase | null,
  dataDir: string,
  category: string,
  paperId: string,
  title: string,
  abstractText: string,
  skipIfAnalyzed: boolean,
  signal?: AbortSignal,
): Promise<{ success: boolean; summary?: string | null; skipped: boolean }> {
  if (skipIfAnalyzed) {
    const existing = await readAnalysisFile(dataDir, 'summaries', category, paperId);
    if (existing) {
      return { success: true, summary: existing, skipped: true };
    }
  }

  const topicNames = paperTopicsDb ? loadEnabledTopicNames(paperTopicsDb) : [];
  const client = createLLMClient(settingsDb);
  const result = await client.analyzePaper(title, abstractText, topicNames, signal);

  await writeAnalysisFile(dataDir, 'summaries', category, paperId, `# ${title}\n\n${result.analysis}`);
  return { success: true, summary: result.analysis, skipped: false };
}

export function filterByTopicIds(
  paperTopicsDb: SqlJsDatabase,
  junctionTable: string,
  topicIds: number[],
  conditions: string[],
  bindValues: unknown[],
): void {
  if (topicIds.length === 0) return;
  const placeholders = topicIds.map(() => '?').join(',');
  const ptResults = paperTopicsDb.exec(
    `SELECT DISTINCT paper_id FROM ${junctionTable} WHERE topic_id IN (${placeholders})`,
    topicIds,
  );
  if (ptResults.length > 0 && ptResults[0].values.length > 0) {
    const paperIds = ptResults[0].values.map(r => r[0] as string);
    conditions.push(`p.id IN (${paperIds.map(() => '?').join(',')})`);
    bindValues.push(...paperIds);
  } else {
    conditions.push('1 = 0');
  }
}
