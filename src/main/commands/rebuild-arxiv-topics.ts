import type { Database as SqlJsDatabase } from 'sql.js';
import { rebuildPaperTopicsAll, rebuildPaperTopicsSingle } from './paper-shared.js';

export function rebuildArxivPaperTopics(
  arxivDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
): number {
  return rebuildPaperTopicsAll({
    paperDb: arxivDb,
    paperTopicsDb,
    junctionTable: 'arxiv_paper_topics',
  });
}

export function updateArxivTopicAssociations(
  arxivDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  topicId: number,
): number {
  return rebuildPaperTopicsSingle({
    paperDb: arxivDb,
    paperTopicsDb,
    junctionTable: 'arxiv_paper_topics',
  }, topicId);
}

export function deleteArxivTopicAssociations(
  paperTopicsDb: SqlJsDatabase,
  topicId: number,
): void {
  paperTopicsDb.run('DELETE FROM arxiv_paper_topics WHERE topic_id = ?', [topicId]);
}
