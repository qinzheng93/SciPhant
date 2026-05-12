import { app, BrowserWindow, shell, Menu } from 'electron';
import { join } from 'path';
import { Database, CONFERENCE_MIGRATIONS } from './database/connection';
import { SettingsDb } from './database/settings';
import { PaperTopicsDb } from './database/paper-topics';
import { migrateFromOldAppData, migrateToSplitDatabases, migrateAnalysesToFiles } from './database/migrations';
import { registerIpcHandlers } from './ipc-handlers';
import { loadDataDir } from './commands/config';

let mainWindow: BrowserWindow | null = null;
let arxivDb: Database | null = null;
let conferenceDb: Database | null = null;
let settingsDb: SettingsDb | null = null;
let paperTopicsDb: PaperTopicsDb | null = null;

app.on('before-quit', async () => {
  if (arxivDb) {
    await arxivDb.close();
    arxivDb = null;
  }
  if (settingsDb) {
    await settingsDb.close();
    settingsDb = null;
  }
  if (paperTopicsDb) {
    await paperTopicsDb.close();
    paperTopicsDb = null;
  }
  if (conferenceDb) {
    conferenceDb.getDb().close();
    conferenceDb = null;
  }
});

function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    title: 'SciPhant',
    width: 1200,
    height: 800,
    minWidth: 842,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('Failed to load app:', err);
    });
  } else {
    mainWindow.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load dev server (is Vite running?):', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.setName('SciPhant');

app.whenReady().then(async () => {

  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'SciPhant',
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const, submenu: [] as Electron.MenuItemConstructorOptions[] },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ] as Electron.MenuItemConstructorOptions[],
    }] : []),
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // Step 1: Migrate data files from old app name ("arXiv Daily") directory
  migrateFromOldAppData();

  // Step 2: Initialize settings DB first (at default userData) to read custom dataDir
  settingsDb = new SettingsDb(join(app.getPath('userData'), 'settings.db'));
  await settingsDb.init();
  const dataDir = loadDataDir(settingsDb.getDb());

  // Step 3: Initialize data databases at custom (or default) dataDir
  arxivDb = new Database(join(dataDir, 'arxiv_papers.db'));
  await arxivDb.init();

  conferenceDb = new Database(join(dataDir, 'conference_papers.db'), CONFERENCE_MIGRATIONS);
  await conferenceDb.init();

  paperTopicsDb = new PaperTopicsDb(join(dataDir, 'paper_topics.db'));
  await paperTopicsDb.init();

  // Step 4: Migrate schema data (topics, config) from arxiv_papers.db to split databases
  const migrated = migrateToSplitDatabases(arxivDb, settingsDb, paperTopicsDb);
  if (migrated) {
    await settingsDb.save();
    await paperTopicsDb.save();
    await arxivDb.save();
  }

  // Step 5: Migrate analyses from SQL to markdown files
  const { existsSync } = await import('fs');
  const analysesMigrated = await migrateAnalysesToFiles(arxivDb, null, conferenceDb, dataDir);
  if (analysesMigrated) {
    await arxivDb.save();
  }

  registerIpcHandlers(arxivDb, conferenceDb, settingsDb, paperTopicsDb, dataDir, createWindow());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err) => {
  console.error('App initialization failed:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
