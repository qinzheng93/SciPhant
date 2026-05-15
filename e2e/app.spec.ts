import { test, expect } from '@playwright/test';
import { launchApp, closeApp } from './helpers';
import type { ElectronApplication, Page } from '@playwright/test';

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(app);
});

// ── App Launch ──────────────────────────────────

test('app launches with correct title', async () => {
  const title = await window.title();
  expect(title).toBe('Blueberry');
});

// ── Sidebar - arXiv Mode ───────────────────────

test.describe('arXiv sidebar', () => {
  test('shows fetch and summarize buttons', async () => {
    const sidebar = window.locator('.sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('获取论文')).toBeVisible();
    await expect(sidebar.getByText('总结论文')).toBeVisible();
  });

  test('shows date list section', async () => {
    const sidebar = window.locator('.sidebar');
    await expect(sidebar.getByText('日期列表')).toBeVisible();
    await expect(sidebar.getByText('全部论文')).toBeVisible();
  });

  test('expand fetch menu shows all sub-items', async () => {
    const sidebar = window.locator('.sidebar');
    const fetchGroup = sidebar.locator('.expand-group').first();
    const fetchBtn = fetchGroup.locator('.btn-fetch');

    await fetchBtn.click();
    await expect(fetchGroup).toHaveClass(/expanded/);
    await expect(sidebar.getByText('获取最新论文')).toBeVisible();
    await expect(sidebar.getByText('获取最近一周')).toBeVisible();
    await expect(sidebar.getByText('获取指定日期')).toBeVisible();
    await expect(sidebar.getByText('获取指定论文')).toBeVisible();

    // Collapse
    await fetchBtn.click();
    await expect(fetchGroup).not.toHaveClass(/expanded/);
  });

  test('expand summarize menu shows all sub-items', async () => {
    const sidebar = window.locator('.sidebar');
    const summarizeGroup = sidebar.locator('.expand-group').nth(1);
    const summarizeBtn = summarizeGroup.locator('.btn-fetch');

    await summarizeBtn.click();
    await expect(summarizeGroup).toHaveClass(/expanded/);
    await expect(sidebar.getByText('总结所有话题')).toBeVisible();
    await expect(sidebar.getByText('总结当前列表')).toBeVisible();
    await expect(sidebar.getByText('总结选中论文')).toBeVisible();

    // Collapse
    await summarizeBtn.click();
    await expect(summarizeGroup).not.toHaveClass(/expanded/);
  });

  test('only one menu can be expanded at a time', async () => {
    const sidebar = window.locator('.sidebar');
    const fetchGroup = sidebar.locator('.expand-group').first();
    const summarizeGroup = sidebar.locator('.expand-group').nth(1);

    await fetchGroup.locator('.btn-fetch').click();
    await expect(fetchGroup).toHaveClass(/expanded/);

    await summarizeGroup.locator('.btn-fetch').click();
    await expect(fetchGroup).not.toHaveClass(/expanded/);
    await expect(summarizeGroup).toHaveClass(/expanded/);

    // Clean up
    await summarizeGroup.locator('.btn-fetch').click();
  });

  test('fetch menu opens date dialog on click', async () => {
    const sidebar = window.locator('.sidebar');
    const fetchGroup = sidebar.locator('.expand-group').first();

    await fetchGroup.locator('.btn-fetch').click();
    await sidebar.getByText('获取指定日期').click();

    await expect(window.locator('.dialog-overlay')).toBeVisible();
    await expect(window.getByText('按日期抓取论文')).toBeVisible();

    // Close dialog
    await window.locator('.dialog-overlay .btn-cancel').click();
    await expect(window.locator('.dialog-overlay')).not.toBeVisible();
  });

  test('fetch menu opens single paper dialog on click', async () => {
    const sidebar = window.locator('.sidebar');
    const fetchGroup = sidebar.locator('.expand-group').first();

    await fetchGroup.locator('.btn-fetch').click();
    await sidebar.getByText('获取指定论文').click();

    await expect(window.locator('.dialog-overlay')).toBeVisible();
    await expect(window.locator('.dialog-overlay .form-input')).toBeVisible();

    // Close dialog
    await window.locator('.dialog-overlay .btn-cancel').click();
  });
});

// ── Mode Toggle ────────────────────────────────

test.describe('mode toggle', () => {
  test('switches to conference mode', async () => {
    const toggle = window.locator('.mode-toggle');
    await toggle.click();

    const sidebar = window.locator('.sidebar');
    await expect(sidebar.getByText('会议列表')).toBeVisible();
    await expect(sidebar.getByText('导入会议')).toBeVisible();
    await expect(toggle).toHaveClass(/mode-conference/);
  });

  test('conference sidebar shows summarize menu', async () => {
    const sidebar = window.locator('.sidebar');
    const summarizeGroup = sidebar.locator('.expand-group');
    const summarizeBtn = summarizeGroup.locator('.btn-fetch');

    await summarizeBtn.click();
    await expect(summarizeGroup).toHaveClass(/expanded/);
    await expect(sidebar.getByText('总结当前列表')).toBeVisible();
    await expect(sidebar.getByText('总结选中论文')).toBeVisible();

    await summarizeBtn.click();
  });

  test('switches back to arXiv mode', async () => {
    const toggle = window.locator('.mode-toggle');
    await toggle.click();

    const sidebar = window.locator('.sidebar');
    await expect(sidebar.getByText('日期列表')).toBeVisible();
    await expect(sidebar.getByText('获取论文')).toBeVisible();
    await expect(toggle).not.toHaveClass(/mode-conference/);
  });
});

// ── Queue Panel ────────────────────────────────

test.describe('queue panel', () => {
  test('opens and shows three queue sections', async () => {
    const queueBtn = window.locator('.btn-queue');
    await queueBtn.click();

    const panel = window.locator('.queue-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('总结队列')).toBeVisible();
    await expect(panel.getByText('分析队列')).toBeVisible();
    await expect(panel.getByText('下载队列')).toBeVisible();
  });

  test('queues show empty state', async () => {
    const panel = window.locator('.queue-panel');
    const emptyMessages = panel.locator('.queue-empty');
    await expect(emptyMessages).toHaveCount(3);
  });

  test('collapses and expands queue sections', async () => {
    const panel = window.locator('.queue-panel');

    // Ensure queue panel is open
    if (!(await panel.isVisible())) {
      await window.locator('.btn-queue').click();
      await expect(panel).toBeVisible();
    }

    const headers = panel.locator('.queue-panel-header');

    // Headers start collapsed (empty queues). Click to expand.
    await headers.nth(0).click();
    await expect(headers.nth(0)).not.toHaveClass(/collapsed/);

    // Click again to collapse
    await headers.nth(0).click();
    await expect(headers.nth(0)).toHaveClass(/collapsed/);
  });

  test('closes queue panel on outside click', async () => {
    // Click on the main content area to close
    await window.locator('.paper-list').click();
    await expect(window.locator('.queue-panel')).not.toBeVisible();
  });
});

// ── Config Page ────────────────────────────────

test.describe('config page', () => {
  test('navigates to config page', async () => {
    const configBtn = window.locator('.sidebar .btn-icon');
    await configBtn.click();

    await expect(window.locator('.config-view')).toBeVisible();
    await expect(window.locator('.config-view').getByText('通用设置')).toBeVisible();
  });

  test('shows all settings sections', async () => {
    const config = window.locator('.config-view');
    await expect(config.getByText('通用设置')).toBeVisible();
    await expect(config.getByText('抓取分类')).toBeVisible();
    await expect(config.getByText('话题管理')).toBeVisible();
    await expect(config.getByText('LLM 设置')).toBeVisible();
  });

  test('theme buttons are present', async () => {
    const config = window.locator('.config-view');
    const themeButtons = config.locator('.btn-theme');
    await expect(themeButtons).toHaveCount(3);
    await expect(config.getByText('浅色')).toBeVisible();
    await expect(config.getByText('深色')).toBeVisible();
    await expect(config.getByText('跟随系统')).toBeVisible();
  });

  test('clicking dark theme changes theme', async () => {
    const config = window.locator('.config-view');
    await config.locator('.btn-theme', { hasText: '深色' }).click();

    const html = window.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Switch back to light
    await config.locator('.btn-theme', { hasText: '浅色' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('data directory section shows path and buttons', async () => {
    const config = window.locator('.config-view');
    await expect(config.getByText('数据目录')).toBeVisible();
    await expect(config.getByText('选择目录')).toBeVisible();
    await expect(config.getByText('恢复默认')).toBeVisible();
  });

  test('topic editor shows add and rebuild buttons', async () => {
    const config = window.locator('.config-view');
    await expect(config.getByText('添加话题')).toBeVisible();
    await expect(config.getByText('重建索引')).toBeVisible();
  });

  test('LLM settings shows form fields', async () => {
    const config = window.locator('.config-view');
    // API Key appears in both LLM and Zotero settings - use first
    await expect(config.getByText('API Key').first()).toBeVisible();
    await expect(config.getByText('Base URL')).toBeVisible();
    // Use exact match to avoid matching topic keywords containing "Model"
    await expect(config.getByText('Model', { exact: true })).toBeVisible();
    await expect(config.getByText('测试连接').first()).toBeVisible();
  });

  test('navigates back to home page', async () => {
    // Ensure config page is visible (previous test failure may have affected state)
    const configView = window.locator('.config-view');
    if (!(await configView.isVisible())) {
      const configBtn = window.locator('.sidebar .btn-icon');
      await configBtn.click();
      await expect(configView).toBeVisible();
    }
    // Scroll to top in case config page was scrolled
    await window.evaluate(() => document.querySelector('.config-content')?.scrollTo(0, 0));
    const backBtn = window.locator('.config-view .back-btn');
    await backBtn.click({ force: true });

    await expect(window.locator('.sidebar')).toBeVisible();
    await expect(configView).not.toBeVisible();
  });
});

// ── Search ─────────────────────────────────────

test.describe('search', () => {
  test('search input is visible in header', async () => {
    const searchInput = window.locator('.search-bar input');
    await expect(searchInput).toBeVisible();
  });

  test('typing in search shows clear button', async () => {
    const searchInput = window.locator('.search-bar input');
    await searchInput.fill('test query');

    const clearBtn = window.locator('.search-clear');
    await expect(clearBtn).toBeVisible();

    // Clear
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
    await expect(clearBtn).not.toBeVisible();
  });
});
