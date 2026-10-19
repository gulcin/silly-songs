import fs from 'node:fs';
import path from 'node:path';
import { webkit, devices } from '@playwright/test';

const outDir = process.env.SHOTS_DIR || '/tmp/silly-shots';
fs.mkdirSync(outDir, { recursive: true });

const shots = [
  ['ipad-landscape', devices['iPad (gen 7) landscape'], 'ipad_landscape_song_page.png'],
  ['ipad-portrait', devices['iPad (gen 7)'], 'ipad_portrait_song_page.png'],
  ['iphone', devices['iPhone 13'], 'iphone_song_page.png'],
];

const browser = await webkit.launch();
const videoPath = path.resolve('tests/fixtures/tiny.mp4');

for (const [name, device, file] of shots) {
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  const title = page.getByRole('textbox', { name: 'Song title' });
  await title.waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Page 3', exact: true }).click();
  await page.getByRole('button', { name: 'Hand' }).click();
  await page.getByRole('button', { name: 'Berry ink' }).click();
  await title.fill('The Banana Bus');
  await page.getByRole('textbox', { name: 'Lyrics' }).fill(
    'The banana bus goes beep beep beep\nThe wheels are yellow, the seats are sweet\nWe bounce along and sing this song\nAll the way home, then we sing again'
  );
  await page.locator('#video-input').setInputFiles(videoPath);
  await page.locator('video').waitFor({ state: 'visible' });
  await page.waitForTimeout(600);
  await page.locator('video').evaluate(async (video) => {
    if (video.readyState < 2) {
      await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
    }
    try {
      video.muted = true;
      await video.play();
      video.pause();
    } catch (err) {
      /* A poster is enough if autoplay is blocked. */
    }
    if (video.videoWidth) {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      video.poster = canvas.toDataURL('image/jpeg', 0.9);
    }
  }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  const target = path.join(outDir, file);
  await page.screenshot({ path: target });
  const scroll = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    w: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  console.log(name, scroll, target);
  await context.close();
}

await browser.close();
