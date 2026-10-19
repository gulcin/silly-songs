# Silly Songs

A ten-page songbook for an iPad or iPhone. Every page starts blank. Titles, lyrics, and videos stay on the device after the tab is closed or the app is opened from the Home Screen.

Live site: https://gulcin.github.io/silly-songs/

Version 1.0.0.

## On the page

- Numbered tabs, plus previous and next, move between the 10 pages.
- The title and the lyrics can use round, hand, or story lettering, in five ink colours.
- **Add a video** opens the photo library or the camera (`input type="file" accept="video/*"`). Videos play on that page.
- **Save to Photos** shares a picture of the words, or a video file, through the Web Share API. If sharing is not available, the file downloads instead.
- **Send to Mum** is on every screen. It writes to gulcin.yildirim@clickhouse.com with the app version and the page number.

## Saving

Titles and lyrics are stored in IndexedDB. Video bytes are stored there too, then played from a blob URL on the page. On startup the app calls `navigator.storage.persist()` so the browser is asked to keep that data.

## Home screen

The app is a PWA. `manifest.webmanifest` and the icons are in `public/`. The service worker tries the network first and falls back to its cache, and the page reloads at most once when a new worker takes over, so an update does not get stuck on iOS Safari. `version.json` is always fetched from the network.

## Develop

```bash
npm install
npx playwright install webkit
npm start
npm test
```

Tests run in WebKit at iPad, iPad mini, iPhone, and iPhone SE sizes. They check the ten pages, text, a video fixture, reload persistence, and that the page does not scroll.

GitHub Actions deploys the `public/` folder with `actions/deploy-pages`.
