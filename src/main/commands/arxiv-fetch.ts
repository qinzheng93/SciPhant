import type { Database as SqlJsDatabase } from 'sql.js';
import { fetchFromApi, fetchSinglePaper, parseArxivIdFromInput, savePapers, todayStr, daysAgoStr } from '../services/arxiv-api.js';
import { rebuildArxivPaperTopics } from './rebuild-arxiv-topics.js';

export interface ArxivFailedCategory {
  category: string;
  error: string;
}

export interface ArxivFetchPapersResult {
  success: boolean;
  new_count: number;
  existing_count: number;
  failed_categories: string[];
  failed_details: ArxivFailedCategory[];
}

export interface ArxivFetchPapersByDateParams {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  categories?: string[];
}

export interface ArxivFetchPapersByDateResult {
  success: boolean;
  local_count: number;
  new_count: number;
  total_count: number;
  failed_categories: string[];
  failed_details: ArxivFailedCategory[];
  error?: string;
}

// ── Internal shared logic ─────────────────────────────────────

async function fetchArxivPapersInRange(
  db: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  startDate: string,
  endDate: string,
  categories: string[],
): Promise<{ new_count: number; total_count: number; failed_categories: string[]; failed_details: ArxivFailedCategory[] }> {
  let totalNew = 0;
  const failed: string[] = [];
  const failedDetails: ArxivFailedCategory[] = [];
  const allApiIds = new Set<string>();

  for (const category of categories) {
    try {
      const papers = await fetchFromApi(category, startDate, endDate);
      for (const p of papers) {
        allApiIds.add(p.arxiv_id);
      }
      const [inserted] = savePapers(db, papers);
      totalNew += inserted;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[fetch] Failed for ${category}:`, errMsg);
      failed.push(category);
      failedDetails.push({ category, error: errMsg });
    }
  }

  // Refresh topic matching for all papers
  try {
    rebuildArxivPaperTopics(db, paperTopicsDb);
  } catch (e) {
    console.error('[fetch] Failed to refresh topics:', e);
  }

  return { new_count: totalNew, total_count: allApiIds.size, failed_categories: failed, failed_details: failedDetails };
}

function resolveArxivCategories(db: SqlJsDatabase, categories: string[]): string[] {
  if (categories.length > 0) return categories;
  const rows = db.exec('SELECT name FROM categories WHERE enabled = TRUE');
  if (rows.length === 0) return [];
  return rows[0].values.map(row => row[0] as string);
}

// ── Public commands ───────────────────────────────────────────

/**
 * Fetch latest papers (yesterday + today) via arXiv API.
 */
export async function fetchArxivPapers(db: SqlJsDatabase, paperTopicsDb: SqlJsDatabase, categories: string[]): Promise<ArxivFetchPapersResult> {
  const cats = resolveArxivCategories(db, categories);
  if (cats.length === 0) {
    return { success: false, new_count: 0, existing_count: 0, failed_categories: [], failed_details: [] };
  }

  const startDate = daysAgoStr(1);
  const endDate = todayStr();
  const { new_count, total_count, failed_categories, failed_details } = await fetchArxivPapersInRange(db, paperTopicsDb, startDate, endDate, cats);

  return {
    success: true,
    new_count: new_count,
    existing_count: total_count - new_count,
    failed_categories: failed_categories,
    failed_details: failed_details,
  };
}

/**
 * Fetch this week's papers via arXiv API (last 7 days including today).
 */
export async function fetchArxivPapersThisWeek(db: SqlJsDatabase, paperTopicsDb: SqlJsDatabase, categories: string[]): Promise<ArxivFetchPapersResult> {
  const cats = resolveArxivCategories(db, categories);
  if (cats.length === 0) {
    return { success: false, new_count: 0, existing_count: 0, failed_categories: [], failed_details: [] };
  }

  const startDate = daysAgoStr(6);
  const endDate = todayStr();
  const { new_count, total_count, failed_categories, failed_details } = await fetchArxivPapersInRange(db, paperTopicsDb, startDate, endDate, cats);

  return {
    success: true,
    new_count: new_count,
    existing_count: total_count - new_count,
    failed_categories: failed_categories,
    failed_details: failed_details,
  };
}

/**
 * Fetch papers for a specific date range via arXiv API.
 */
export async function fetchArxivPapersByDate(
  db: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  params: ArxivFetchPapersByDateParams,
): Promise<ArxivFetchPapersByDateResult> {
  const { startDate, endDate } = params;
  const cats = params.categories || [];

  if (cats.length === 0) {
    return { success: false, local_count: 0, new_count: 0, total_count: 0, failed_categories: [], failed_details: [] };
  }

  const { new_count, total_count, failed_categories, failed_details } = await fetchArxivPapersInRange(db, paperTopicsDb, startDate, endDate, cats);

  return {
    success: true,
    local_count: Math.max(0, total_count - new_count),
    new_count,
    total_count,
    failed_categories: failed_categories,
    failed_details: failed_details,
  };
}

export interface FetchPapersResult {
  success: boolean;
  fetched: { id: string; title: string }[];
  existing: number;
  failed: number;
  errors: string[];
}

export async function fetchArxivPapersByIds(
  db: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  input: string,
): Promise<FetchPapersResult> {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  const parsed = parts.map(p => ({ input: p, id: parseArxivIdFromInput(p) }));
  const failedParse = parsed.filter(p => p.id === null).map(p => p.input);

  if (failedParse.length > 0) {
    return { success: false, fetched: [], existing: 0, failed: 0, errors: [`无法解析: ${failedParse.join(', ')}`] };
  }

  const uniqueIds = Array.from(new Set(parsed.map(p => p.id as string)));

  const fetched: { id: string; title: string }[] = [];
  let existing = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const arxivId of uniqueIds) {
    try {
      const paper = await fetchSinglePaper(arxivId);
      if (!paper) { failed++; errors.push(`${arxivId}: 未找到`); continue; }

      const [inserted] = savePapers(db, [paper]);
      if (inserted === 0) { existing++; continue; }

      fetched.push({ id: paper.arxiv_id, title: paper.title });
    } catch (e) {
      failed++;
      errors.push(`${arxivId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (fetched.length > 0) {
    rebuildArxivPaperTopics(db, paperTopicsDb);
  }

  return { success: fetched.length > 0, fetched, existing, failed, errors };
}
