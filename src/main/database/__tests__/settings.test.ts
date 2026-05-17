import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import { join } from 'path';

vi.mock('../connection.js', async () => {
  const initSqlJs = (await import('sql.js')).default;
  return {
    getSqlJs: () => initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }),
  };
});

import { SettingsDb } from '../settings.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = join(os.tmpdir(), `settings-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe('SettingsDb', () => {
  it('creates app_config table on init', async () => {
    const dbPath = join(tmpDir, 'settings.db');
    const settings = new SettingsDb(dbPath);
    await settings.init();

    const tables = settings.getDb().exec("SELECT name FROM sqlite_master WHERE type='table'");
    const tableNames = tables[0].values.flat() as string[];
    expect(tableNames).toContain('app_config');

    await settings.close();
  });

  it('is idempotent — second init does not fail', async () => {
    const dbPath = join(tmpDir, 'settings.db');
    const settings = new SettingsDb(dbPath);
    await settings.init();

    // Insert data
    settings.getDb().run("INSERT INTO app_config (key, value) VALUES ('theme', 'dark')");
    await settings.close();

    // Re-init from file
    const settings2 = new SettingsDb(dbPath);
    await settings2.init();

    const rows = settings2.getDb().exec("SELECT value FROM app_config WHERE key = 'theme'");
    expect(rows[0].values[0][0]).toBe('dark');

    await settings2.close();
  });

  it('persists data to disk on close', async () => {
    const dbPath = join(tmpDir, 'settings.db');
    const settings = new SettingsDb(dbPath);
    await settings.init();
    settings.getDb().run("INSERT INTO app_config (key, value) VALUES ('test', 'value')");
    await settings.close();

    expect(fsSync.existsSync(dbPath)).toBe(true);
  });

  it('throws getDb before init', () => {
    const settings = new SettingsDb(join(tmpDir, 'noop.db'));
    expect(() => settings.getDb()).toThrow('not initialized');
  });
});
