import type { Database as SqlJsDatabase } from 'sql.js';
import type { ArxivPaper } from '../../shared/ipc-api.js';
import type { DeepAnalysisResult } from '../services/llm-client.js';
import type { Topic } from '../../shared/ipc-api.js';
import { filterPaperTopics } from '../services/filter.js';
import { LLMClient } from '../services/llm-client.js';
import { loadLLMConfig } from './config.js';
import { extractTextFromUrl } from '../services/pdf-extractor.js';
import { writeAnalysisFile, readAnalysisFile } from '../services/analysis-files.js';

export const BASE_SQL = `SELECT
    p.id, p.title, p.authors, p.abstract, p.url, p.pdf_url,
    p.published_date, p.updated_date, p.categories, p.fetched_at
FROM papers p`;

export function rowToPaper(row: Record<string, unknown>): ArxivPaper {
  return {
    ...row,
    authors: JSON.parse(row.authors as string),
    categories: JSON.parse(row.categories as string),
  } as ArxivPaper;
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
  return loadEnabledTopics(paperTopicsDb).map(t => t.name);
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

const VALID_JUNCTION_TABLES = ['arxiv_paper_topics', 'conference_paper_topics'] as const;
type JunctionTable = typeof VALID_JUNCTION_TABLES[number];

export function filterByTopicIds(
  paperTopicsDb: SqlJsDatabase,
  junctionTable: JunctionTable,
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

// ── Shared topic loading helpers ──

export function loadEnabledTopics(paperTopicsDb: SqlJsDatabase): Topic[] {
  const topicRows = paperTopicsDb.exec('SELECT id, name, keywords, enabled FROM topics WHERE enabled = TRUE');
  return topicRows.length > 0
    ? topicRows[0].values.map(row => ({
        id: row[0] as number,
        name: row[1] as string,
        keywords: JSON.parse(row[2] as string),
        enabled: Boolean(row[3]),
      }))
    : [];
}

export function loadSingleTopic(paperTopicsDb: SqlJsDatabase, topicId: number): Topic | null {
  const topicRows = paperTopicsDb.exec('SELECT id, name, keywords, enabled FROM topics WHERE id = ?', [topicId]);
  if (topicRows.length === 0 || !topicRows[0].values.length) return null;
  const row = topicRows[0].values[0];
  return {
    id: row[0] as number,
    name: row[1] as string,
    keywords: JSON.parse(row[2] as string),
    enabled: Boolean(row[3]),
  };
}

export interface RebuildOptions {
  paperDb: SqlJsDatabase;
  paperTopicsDb: SqlJsDatabase;
  junctionTable: 'arxiv_paper_topics' | 'conference_paper_topics';
}

export function rebuildPaperTopicsAll(opts: RebuildOptions): number {
  const topics = loadEnabledTopics(opts.paperTopicsDb);
  const paperRows = opts.paperDb.exec('SELECT id, title, abstract FROM papers');
  if (paperRows.length === 0) return 0;
  const count = paperRows[0].values.length;
  opts.paperTopicsDb.run('BEGIN TRANSACTION');
  opts.paperTopicsDb.run(`DELETE FROM ${opts.junctionTable}`);
  for (const row of paperRows[0].values) {
    const paperId = row[0] as string;
    const title = row[1] as string;
    const abstract = row[2] as string;
    for (const topicId of filterPaperTopics(title, abstract, topics)) {
      opts.paperTopicsDb.run(
        `INSERT OR IGNORE INTO ${opts.junctionTable} (paper_id, topic_id) VALUES (?, ?)`,
        [paperId, topicId],
      );
    }
  }
  opts.paperTopicsDb.run('COMMIT');
  return count;
}

export function rebuildPaperTopicsSingle(opts: RebuildOptions, topicId: number): number {
  const topic = loadSingleTopic(opts.paperTopicsDb, topicId);
  if (!topic) return 0;
  if (!topic.enabled) {
    opts.paperTopicsDb.run(`DELETE FROM ${opts.junctionTable} WHERE topic_id = ?`, [topicId]);
    return 0;
  }
  opts.paperTopicsDb.run(`DELETE FROM ${opts.junctionTable} WHERE topic_id = ?`, [topicId]);
  const paperRows = opts.paperDb.exec('SELECT id, title, abstract FROM papers');
  if (paperRows.length === 0) return 0;
  let count = 0;
  opts.paperTopicsDb.run('BEGIN TRANSACTION');
  for (const row of paperRows[0].values) {
    const paperId = row[0] as string;
    const title = row[1] as string;
    const abstract = row[2] as string;
    if (filterPaperTopics(title, abstract, [topic]).length > 0) {
      opts.paperTopicsDb.run(
        `INSERT OR IGNORE INTO ${opts.junctionTable} (paper_id, topic_id) VALUES (?, ?)`,
        [paperId, topicId],
      );
      count++;
    }
  }
  opts.paperTopicsDb.run('COMMIT');
  return count;
}
