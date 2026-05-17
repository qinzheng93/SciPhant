import type { Database as SqlJsDatabase } from 'sql.js';
import { rebuildPaperTopicsAll, rebuildPaperTopicsSingle } from './paper-shared.js';

export function rebuildConferencePaperTopics(
  conferenceDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
): number {
  return rebuildPaperTopicsAll({
    paperDb: conferenceDb,
    paperTopicsDb,
    junctionTable: 'conference_paper_topics',
  });
}

export function updateConferenceTopicAssociations(
  conferenceDb: SqlJsDatabase,
  paperTopicsDb: SqlJsDatabase,
  topicId: number,
): number {
  return rebuildPaperTopicsSingle({
    paperDb: conferenceDb,
    paperTopicsDb,
    junctionTable: 'conference_paper_topics',
  }, topicId);
}

export function deleteConferenceTopicAssociations(
  paperTopicsDb: SqlJsDatabase,
  topicId: number,
): void {
  paperTopicsDb.run('DELETE FROM conference_paper_topics WHERE topic_id = ?', [topicId]);
}
