import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const videoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tiny.mp4');

async function openBook(page) {
  await page.goto('/');
  const title = page.getByRole('textbox', { name: 'Song title' });
  await expect(title).toBeVisible();
  await expect(title).toBeEnabled();
  return title;
}

async function expectNoDocumentScroll(page) {
  const box = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      docH: doc.scrollHeight - doc.clientHeight,
      docW: doc.scrollWidth - doc.clientWidth,
      bodyH: body.scrollHeight - body.clientHeight,
      bodyW: body.scrollWidth - body.clientWidth,
      scrollY: window.scrollY,
      scrollX: window.scrollX,
    };
  });
  const detail = JSON.stringify(box);
  expect(box.docH, detail).toBeLessThanOrEqual(1);
  expect(box.docW, detail).toBeLessThanOrEqual(1);
  expect(box.bodyH, detail).toBeLessThanOrEqual(1);
  expect(box.bodyW, detail).toBeLessThanOrEqual(1);
  expect(box.scrollY, detail).toBe(0);
  expect(box.scrollX, detail).toBe(0);
}

async function saved(page) {
  await expect(page.locator('#app')).toHaveAttribute('data-save-state', 'saved');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__persistCalls = 0;
    const storage = navigator.storage;
    if (storage && typeof storage.persist === 'function') {
      const original = storage.persist.bind(storage);
      storage.persist = async () => {
        window.__persistCalls += 1;
        try {
          return await original();
        } catch (err) {
          return false;
        }
      };
    }
  });
});

test('version files match', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone');
  const version = JSON.parse(fs.readFileSync('public/version.json', 'utf8')).version;
  expect(version).toBe('1.0.0');
  const html = fs.readFileSync('public/index.html', 'utf8');
  const sw = fs.readFileSync('public/sw.js', 'utf8');
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  expect(html).toContain(`data-version="${version}"`);
  expect(sw).toContain(version);
  expect(changelog).toContain(version);
  const urls = [...sw.matchAll(/'\.\/[^']+'/g)].map((match) => match[0].slice(1, -1));
  expect(urls.length).toBeGreaterThan(5);
  for (const url of urls) {
    if (url === './') continue;
    expect(fs.existsSync(path.join('public', url)), url).toBe(true);
  }
});

test('ten blank pages keep their words after reload', async ({ page }) => {
  const title = await openBook(page);
  await expect.poll(() => page.evaluate(() => window.__persistCalls)).toBeGreaterThan(0);
  await expect(page.getByRole('tab')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();

  for (const number of [1, 2, 10]) {
    await page.getByRole('tab', { name: `Page ${number}`, exact: true }).click();
    await expect(title).toHaveValue('');
    await expect(page.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('');
    await expect(page.locator('video')).toHaveCount(0);
  }

  await page.getByRole('tab', { name: 'Page 1', exact: true }).click();
  await title.fill('Bananas on the Bus');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('Beep beep banana');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('tab', { name: 'Page 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await title.fill('Page two song');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('Second page lyrics');
  await page.getByRole('tab', { name: 'Page 10', exact: true }).click();
  await title.fill('Last page');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('Ten silly lines');
  await saved(page);

  await page.reload();
  await expect(title).toBeEnabled();
  await expect(title).toHaveValue('Last page');
  await expect(page.getByRole('tab', { name: 'Page 10', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByRole('tab', { name: 'Page 1', exact: true }).click();
  await expect(title).toHaveValue('Bananas on the Bus');
  await expect(page.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('Beep beep banana');
  await page.getByRole('tab', { name: 'Page 2', exact: true }).click();
  await expect(title).toHaveValue('Page two song');
});

test('a video stays on its page after reload', async ({ page }) => {
  const title = await openBook(page);
  const input = page.locator('#video-input');
  await expect(input).toHaveAttribute('accept', 'video/*');
  expect(await input.getAttribute('multiple')).toBeNull();
  expect(await input.getAttribute('capture')).toBeNull();

  await page.getByRole('tab', { name: 'Page 4', exact: true }).click();
  await title.fill('Video song');
  await page.locator('#video-input').setInputFiles(videoPath);
  const video = page.locator('video');
  await expect(video).toHaveCount(1);
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).toHaveJSProperty('controls', true);
  await saved(page);

  const original = fs.statSync(videoPath).size;
  const size = await video.evaluate(async (element) => {
    const response = await fetch(element.currentSrc || element.src);
    return (await response.arrayBuffer()).byteLength;
  });
  expect(size).toBe(original);

  await page.getByRole('tab', { name: 'Page 5', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Song title' })).toBeEnabled();
  await expect(page.getByRole('tab', { name: 'Page 5', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('video')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Page 4', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Song title' })).toHaveValue('Video song');
  await expect(page.locator('video')).toHaveCount(1);
  const again = await page.locator('video').evaluate(async (element) => {
    const response = await fetch(element.currentSrc || element.src);
    return (await response.arrayBuffer()).byteLength;
  });
  expect(again).toBe(original);
});

test('the songbook fits on one screen', async ({ page }) => {
  const title = await openBook(page);
  await expectNoDocumentScroll(page);
  await title.fill('The Banana Bus');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill('The banana bus goes beep beep beep\nThe wheels are yellow and the seats are sweet');
  await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('video')).toHaveCount(1);
  await expectNoDocumentScroll(page);
  await page.getByRole('tab', { name: 'Page 10', exact: true }).click();
  await expectNoDocumentScroll(page);
  await page.getByRole('button', { name: 'Save to Photos' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoDocumentScroll(page);
});

test('send to mum includes the version and the page', async ({ page }) => {
  await openBook(page);
  const read = () => page.getByRole('link', { name: 'Send to Mum' }).first().evaluate((link) => {
    const url = new URL(link.href);
    return {
      email: url.pathname,
      subject: url.searchParams.get('subject'),
      body: url.searchParams.get('body'),
    };
  });
  const first = await read();
  expect(first.email).toContain('gulcin.yildirim@clickhouse.com');
  expect(first.subject).toContain('1.0.0');
  expect(first.subject).toContain('page 1');
  expect(first.body).toContain('Version: 1.0.0');
  expect(first.body).toContain('Page: 1');

  await page.getByRole('tab', { name: 'Page 4', exact: true }).click();
  const later = await read();
  expect(later.subject).toContain('page 4');
  expect(later.body).toContain('Page: 4');
  expect(later.body).toContain('Version: 1.0.0');
});

test('lettering and ink are saved', async ({ page }) => {
  const title = await openBook(page);
  await page.getByRole('button', { name: 'Hand' }).click();
  await page.getByRole('button', { name: 'Berry ink' }).click();
  await expect(page.locator('#paper')).toHaveAttribute('data-font', 'hand');
  await expect(title).toHaveCSS('font-family', /Patrick Hand/);
  await expect(title).toHaveCSS('color', 'rgb(166, 30, 77)');
  await title.fill('Handwritten');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Song title' })).toBeEnabled();
  await expect(page.locator('#paper')).toHaveAttribute('data-font', 'hand');
  await expect(page.getByRole('button', { name: 'Berry ink' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Song title' })).toHaveCSS('color', 'rgb(166, 30, 77)');
});

test('save to photos offers the picture and the video', async ({ page }) => {
  await openBook(page);
  await page.locator('#video-input').setInputFiles(videoPath);
  await expect(page.locator('video')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save to Photos' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Send to Mum' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Save video/ })).toBeVisible();

  const picture = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save page picture' }).click();
  const download = await picture;
  expect(download.suggestedFilename()).toBe('silly-song-page-1.png');

  const videoDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /Save video/ }).click();
  const video = await videoDownload;
  expect(video.suggestedFilename()).toMatch(/\.mp4$/);
});

test('service worker is ready for offline use', async ({ page }) => {
  await openBook(page);
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active && registration.active.scriptURL.includes('sw.js'));
  });
});
