import type { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs/promises';
import type { SchemaIssue, SourceConference, ConflictInfo, ConflictResolution, ImportResult } from '../../shared/ipc-api.js';
import { getSqlJs } from '../database/connection.js';
import { deleteAnalysisFile } from '../services/analysis-files.js';

// ── Schema Validation ──

const REQUIRED_SCHEMA: Record<string, string[]> = {
  conferences: ['id', 'short_name', 'year', 'full_name'],
  papers: ['id', 'conference_id', 'title', 'authors', 'abstract'],
};

const ALL_KNOWN_COLUMNS: Record<string, string[]> = {
  conferences: ['id', 'short_name', 'year', 'full_name', 'location', 'published_date'],
  papers: ['id', 'conference_id', 'title', 'authors', 'abstract', 'pdf_url', 'supp_url', 'arxiv_url', 'bibtex', 'pages', 'track', 'detail_url'],
};

export function validateConferenceSchema(db: SqlJsDatabase): SchemaIssue {
  const issues: SchemaIssue = { missingTables: [], missingColumns: [], extraColumns: [] };

  const existingTables = new Set<string>();
  const tableResults = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (tableResults.length > 0) {
    for (const row of tableResults[0].values) {
      existingTables.add(row[0] as string);
    }
  }

  for (const [table, requiredCols] of Object.entries(REQUIRED_SCHEMA)) {
    if (!existingTables.has(table)) {
      issues.missingTables.push(table);
      continue;
    }

    const colResults = db.exec(`PRAGMA table_info(${table.replace(/[^a-zA-Z_]/g, '')})`);
    if (colResults.length === 0) continue;
    const existingCols = new Set(colResults[0].values.map(r => r[1] as string));

    for (const col of requiredCols) {
      if (!existingCols.has(col)) {
        issues.missingColumns.push({ table, column: col });
      }
    }

    const knownCols = ALL_KNOWN_COLUMNS[table] || [];
    existingCols.forEach(col => {
      if (!knownCols.includes(col)) {
        issues.extraColumns.push({ table, column: col });
      }
    });
  }

  return issues;
}

export function hasSchemaIssues(issues: SchemaIssue): boolean {
  return issues.missingTables.length > 0 || issues.missingColumns.length > 0;
}

// ── Source Conference Listing ──

export function listSourceConferences(db: SqlJsDatabase): SourceConference[] {
  const results = db.exec(
    `SELECT c.id, c.short_name, c.year, c.full_name, COUNT(p.id) as paper_count
     FROM conferences c LEFT JOIN papers p ON c.id = p.conference_id
     GROUP BY c.id ORDER BY c.year DESC, c.short_name`,
  );
  if (results.length === 0) return [];
  return results[0].values.map(row => ({
    id: row[0] as number,
    short_name: row[1] as string,
    year: row[2] as number,
    full_name: (row[3] as string) ?? null,
    paper_count: row[4] as number,
  }));
}

// ── Find Conflicting Conferences ──

export function findConflicts(
  targetDb: SqlJsDatabase,
  sourceConferences: SourceConference[],
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  for (const conf of sourceConferences) {
    const targetResult = targetDb.exec(
      `SELECT c.id, COUNT(p.id) FROM conferences c
       LEFT JOIN papers p ON c.id = p.conference_id
       WHERE c.short_name = ? AND c.year = ?
       GROUP BY c.id`,
      [conf.short_name, conf.year],
    );
    if (targetResult.length > 0 && targetResult[0].values.length > 0) {
      const targetPaperCount = targetResult[0].values[0][1] as number;
      conflicts.push({ source: conf, targetPaperCount });
    }
  }
  return conflicts;
}

// ── Import Logic ──

export async function clearAnalysisForConference(
  dataDir: string,
  targetDb: SqlJsDatabase,
  conferenceId: number,
): Promise<void> {
  const confResult = targetDb.exec(
    'SELECT short_name, year FROM conferences WHERE id = ?',
    [conferenceId],
  );
  if (confResult.length === 0) return;
  const shortName = confResult[0].values[0][0] as string;
  const year = confResult[0].values[0][1] as number;
  const category = `${shortName}${year}`;

  const paperResult = targetDb.exec(
    'SELECT id FROM papers WHERE conference_id = ?',
    [conferenceId],
  );
  if (paperResult.length === 0) return;

  for (const row of paperResult[0].values) {
    const paperId = row[0] as string;
    await deleteAnalysisFile(dataDir, 'summaries', category, paperId).catch(() => {});
    await deleteAnalysisFile(dataDir, 'analyses', category, paperId).catch(() => {});
  }
}

export async function importFromExternalDb(
  sourcePath: string,
  targetDb: SqlJsDatabase,
  resolutions: ConflictResolution[],
  dataDir?: string,
  selectedConferenceIds?: number[],
): Promise<ImportResult> {
  const SQL = await getSqlJs();
  const buffer = await fs.readFile(sourcePath);
  const sourceDb = new SQL.Database(buffer);

  try {
    let sourceConferences = listSourceConferences(sourceDb);
    if (selectedConferenceIds) {
      const idSet = new Set(selectedConferenceIds);
      sourceConferences = sourceConferences.filter(c => idSet.has(c.id));
    }
    const resolutionMap = new Map(
      resolutions.map(r => [`${r.short_name}:${r.year}`, r.action]),
    );

    let importedConferences = 0;
    let importedPapers = 0;
    let skippedConferences = 0;

    for (const conf of sourceConferences) {
      const key = `${conf.short_name}:${conf.year}`;
      const action = resolutionMap.get(key);

      // Check if conflict exists
      const conflictResult = targetDb.exec(
        'SELECT id FROM conferences WHERE short_name = ? AND year = ?',
        [conf.short_name, conf.year],
      );
      const hasConflict = conflictResult.length > 0 && conflictResult[0].values.length > 0;

      if (hasConflict) {
        if (!action || action === 'skip') {
          skippedConferences++;
          continue;
        }

        const targetConfId = conflictResult[0].values[0][0] as number;

        // Clear analysis files if requested
        if (action === 'overwrite_clear_analysis' && dataDir) {
          await clearAnalysisForConference(dataDir, targetDb, targetConfId);
        }

        targetDb.run('DELETE FROM papers WHERE conference_id = ?', [targetConfId]);
        targetDb.run('DELETE FROM conferences WHERE id = ?', [targetConfId]);
      }

      // Insert conference
      const confRow = sourceDb.exec(
        'SELECT short_name, year, full_name, location, published_date FROM conferences WHERE id = ?',
        [conf.id],
      );
      if (confRow.length === 0 || confRow[0].values.length === 0) continue;
      const cr = confRow[0].values[0];
      targetDb.run(
        'INSERT INTO conferences (short_name, year, full_name, location, published_date) VALUES (?, ?, ?, ?, ?)',
        [cr[0], cr[1], cr[2], cr[3], cr[4]],
      );
      const newConfId = targetDb.exec('SELECT last_insert_rowid()');
      const newId = newConfId[0].values[0][0] as number;
      importedConferences++;

      // Insert papers
      const paperRows = sourceDb.exec(
        `SELECT id, title, authors, abstract, pdf_url, supp_url, arxiv_url, bibtex, pages, track, detail_url
         FROM papers WHERE conference_id = ?`,
        [conf.id],
      );
      if (paperRows.length > 0) {
        for (const pr of paperRows[0].values) {
          targetDb.run(
            `INSERT OR IGNORE INTO papers (id, conference_id, title, authors, abstract, pdf_url, supp_url, arxiv_url, bibtex, pages, track, detail_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pr[0], newId, pr[1], pr[2], pr[3], pr[4], pr[5], pr[6], pr[7], pr[8], pr[9], pr[10]],
          );
          importedPapers++;
        }
      }
    }

    return { success: true, importedConferences, importedPapers, skippedConferences };
  } finally {
    sourceDb.close();
  }
}

// ── Backup / Restore ──

export async function backupConferenceDb(dbPath: string): Promise<string> {
  const backupPath = dbPath + '.backup';
  await fs.copyFile(dbPath, backupPath);
  return backupPath;
}

export async function restoreConferenceDb(backupPath: string, dbPath: string): Promise<void> {
  await fs.rename(backupPath, dbPath);
}

export async function removeBackup(backupPath: string): Promise<void> {
  await fs.unlink(backupPath).catch(() => {});
}
