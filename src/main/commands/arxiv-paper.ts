import type { Database as SqlJsDatabase } from 'sql.js';

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract_text: string;
  url: string;
  pdf_url: string;
  published_date: string;
  updated_date: string;
  categories: string[];
  fetched_at: string;
}

interface PaginatedResult {
  items: Paper[];
  total: number;
  page: number;
  page_size: number;
}

interface FetchDate {
  date: string;
  display: string;
  count: number;
}

import { BASE_SQL, rowToPaper, execResultToPaperRows, buildSearchPattern, filterByTopicIds } from './paper-shared.js';

/**
 * List papers with pagination and filtering.
 */
export function listArxivPapers(db: SqlJsDatabase, paperTopicsDb: SqlJsDatabase | null, params: {
  topicIds?: number[];
  topicId?: number;
  search?: string;
  fetchDate?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 20, 1), 100);
  const offset = (page - 1) * pageSize;

  // Build WHERE clauses dynamically
  const conditions: string[] = [];
  const bindValues: unknown[] = [];

  if (params.search) {
    const pattern = buildSearchPattern(params.search);
    conditions.push("(p.title LIKE ? ESCAPE '\\' OR p.abstract_text LIKE ? ESCAPE '\\')");
    bindValues.push(pattern, pattern);
  }
  if (params.fetchDate) {
    conditions.push('date(p.updated_date) = ?');
    bindValues.push(params.fetchDate);
  }

  // Topic filtering (support both topicIds array and legacy topicId)
  const topicIds = params.topicIds && params.topicIds.length > 0
    ? params.topicIds
    : params.topicId != null ? [params.topicId] : [];

  if (topicIds.length > 0 && paperTopicsDb) {
    filterByTopicIds(paperTopicsDb, 'arxiv_paper_topics', topicIds, conditions, bindValues);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countSql = `SELECT COUNT(*) FROM papers p ${whereClause}`;
  const countResults = db.exec(countSql, bindValues);
  const total = countResults[0]?.values[0]?.[0] ?? 0;

  // Fetch data
  const dataSql = `${BASE_SQL} ${whereClause} ORDER BY p.updated_date DESC LIMIT ? OFFSET ?`;
  const dataResults = db.exec(dataSql, [...bindValues, pageSize, offset]);
  const items = dataResults.length > 0
    ? execResultToPaperRows(dataResults[0]).map(rowToPaper)
    : [];

  return { items, total: total as number, page, page_size: pageSize };
}

/**
 * Format a date string as "YYYY年M月D日" for display.
 * dateStr is date-only (YYYY-MM-DD).
 */
function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`;
}

/**
 * List all distinct publish dates with paper counts.
 */
export function listArxivFetchDates(db: SqlJsDatabase): FetchDate[] {
  const results = db.exec(
    `SELECT date(updated_date) as pub_date, COUNT(*) as cnt
     FROM papers
     WHERE published_date IS NOT NULL
     GROUP BY pub_date
     ORDER BY pub_date DESC`,
  );
  if (results.length === 0) return [];
  return results[0].values
    .filter(row => {
      const dateStr = row[0] as string;
      return dateStr && dateStr.length > 0;
    })
    .map(row => ({
      date: row[0] as string,
      display: formatDateDisplay(row[0] as string),
      count: row[1] as number,
    }));
}
