import { BrowserWindow } from 'electron';
import { join } from 'path';

let updateWindow: BrowserWindow | null = null;

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
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  updateWindow.loadFile(join(__dirname, 'update-window/update.html'));
  updateWindow.on('closed', () => {
    updateWindow = null;
  });
}

export function closeUpdateWindow(): void {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close();
  }
}
