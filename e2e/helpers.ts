import { test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { join } from 'path';

export async function launchApp(): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [join(__dirname, '../dist/main/index.js')],
    env: {
      ...process.env,
      // Use a temp data dir to avoid affecting real data
      BLUEBERRY_DATA_DIR: join(__dirname, '../.test-data'),
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { app, window };
}

export async function closeApp(app: ElectronApplication) {
  await app.close();
}
