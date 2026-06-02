import { BrowserWindow } from 'electron';
import { join, resolve } from 'path';

let updateWindow: BrowserWindow | null = null;

// __dirname is dist/main/services/ — resolve relative to dist/main/
const mainRoot = resolve(__dirname, '..');

export function showUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.focus();
    return;
  }
  updateWindow = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Blueberry Update',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(mainRoot, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  updateWindow.loadFile(join(mainRoot, 'update-window/update.html'));
  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

export function closeUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
}
