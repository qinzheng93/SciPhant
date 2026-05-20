import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { showUpdateWindow, closeUpdateWindow } from './update-window.js';

let mainWindow: BrowserWindow | null = null;

function sendStatus(status: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', { status, data });
  }
}

export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win;
  autoUpdater.autoDownload = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => sendStatus('checking'));
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
    showUpdateWindow();
  });
  autoUpdater.on('update-not-available', () => sendStatus('not-available'));
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendStatus('downloading', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  autoUpdater.on('update-downloaded', () => sendStatus('downloaded'));
  autoUpdater.on('error', (err: Error) => sendStatus('error', { message: err.message }));

  // Check on startup (delayed to avoid slowing down app launch)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('[AutoUpdater] Startup check failed:', err);
    });
  }, 3000);
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const result = await autoUpdater.checkForUpdates();
  return result?.updateInfo ?? null;
}

export async function downloadUpdate(): Promise<string[]> {
  return autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  closeUpdateWindow();
  autoUpdater.quitAndInstall();
}

export function getAppVersion(): string {
  return app.getVersion();
}
