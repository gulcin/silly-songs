const VERSION = document.documentElement.dataset.version || '1.0.0';
const PAGE_COUNT = 10;
const FONTS = ['rounded', 'hand', 'story'];
const COLOURS = ['#5c3d8f', '#a61e4d', '#0f6e6b', '#c4511a', '#24366b'];
const FONT_FAMILY = {
  rounded: 'Fredoka',
  hand: 'Patrick Hand',
  story: 'Fraunces',
};

const app = document.querySelector('#app');
const title = document.querySelector('#title');
const lyrics = document.querySelector('#lyrics');
const paper = document.querySelector('#paper');
const sheet = document.querySelector('#sheet');
const clips = document.querySelector('#clips');
const prev = document.querySelector('#prev');
const next = document.querySelector('#next');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const fontButtons = [...document.querySelectorAll('.fonts button')];
const swatches = [...document.querySelectorAll('.swatch')];
const videoInput = document.querySelector('#video-input');
const saveBtn = document.querySelector('#save-photos');
const saveLayer = document.querySelector('#save-layer');
const saveCard = saveLayer.querySelector('.save-card');
const saveTitle = document.querySelector('#save-title');
const saveHelp = document.querySelector('#save-help');
const savePicture = document.querySelector('#save-picture');
const saveVideos = document.querySelector('#save-videos');
const saveClose = document.querySelector('#save-close');
const pageStatus = document.querySelector('#page-status');
const toast = document.querySelector('#toast');

let state = blankBook();
let saveChain = Promise.resolve();
let pendingSaves = 0;
let videoToken = 0;
const liveUrls = new Set();
let pictureFile = null;
let videoFiles = [];
let toastTimer = 0;

function blankPage() {
  return { title: '', lyrics: '', font: 'rounded', color: COLOURS[0], videos: [] };
}

function blankBook() {
  return {
    current: 0,
    pages: Array.from({ length: PAGE_COUNT }, blankPage),
  };
}

function askToKeepStorage() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }
  } catch (err) {
    /* Persistence is a request, not a requirement for the songbook to open. */
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('silly-songs', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function idbGet(store, key) {
  return db().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function idbPut(store, key, value) {
  return db().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    const request = tx.objectStore(store).put(value, key);
    request.onerror = () => reject(request.error || new Error('save failed'));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || request.error || new Error('save failed'));
    tx.onabort = () => reject(tx.error || request.error || new Error('save aborted'));
  }));
}

function idbDelete(store, key) {
  return db().then((database) => new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function normaliseBook(saved) {
  if (!saved || !Array.isArray(saved.pages) || saved.pages.length !== PAGE_COUNT) return null;
  return {
    current: Math.min(PAGE_COUNT - 1, Math.max(0, saved.current | 0)),
    pages: saved.pages.map((page) => ({
      title: typeof page.title === 'string' ? page.title : '',
      lyrics: typeof page.lyrics === 'string' ? page.lyrics : '',
      font: FONTS.includes(page.font) ? page.font : 'rounded',
      color: COLOURS.includes(page.color) ? page.color : COLOURS[0],
      videos: Array.isArray(page.videos) ? page.videos.filter((id) => typeof id === 'string') : [],
    })),
  };
}

function snapshot() {
  return {
    current: state.current,
    pages: state.pages.map((page) => ({
      title: page.title,
      lyrics: page.lyrics,
      font: page.font,
      color: page.color,
      videos: [...page.videos],
    })),
  };
}

function commitFields() {
  const page = state.pages[state.current];
  page.title = title.value;
  page.lyrics = lyrics.value;
}

function scheduleSave() {
  const copy = snapshot();
  pendingSaves += 1;
  app.dataset.saveState = 'saving';
  saveChain = saveChain.then(() => idbPut('kv', 'book', copy)).then(() => {
    pendingSaves -= 1;
    if (pendingSaves === 0) app.dataset.saveState = 'saved';
  }).catch((err) => {
    pendingSaves -= 1;
    app.dataset.saveState = 'error';
    console.error(err);
    showToast('Could not save just now. Try again in a moment.');
  });
  return saveChain;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function mumHref() {
  const pageNumber = state.current + 1;
  const subject = `Silly Songs feedback (v${VERSION}, page ${pageNumber})`;
  const body = [
    'App: Silly Songs',
    `Version: ${VERSION}`,
    `Page: ${pageNumber}`,
    '',
    'What happened:',
    '',
  ].join('\n');
  return `mailto:gulcin.yildirim@clickhouse.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function updateMum() {
  const href = mumHref();
  document.querySelectorAll('a.mum').forEach((link) => {
    link.href = href;
  });
}

function updateDots() {
  tabs.forEach((tab, index) => {
    const page = state.pages[index];
    const used = page.title.trim() || page.lyrics.trim() || page.videos.length > 0;
    tab.classList.toggle('has-song', used);
    tab.setAttribute('aria-selected', index === state.current ? 'true' : 'false');
  });
}

function applyStyle() {
  const page = state.pages[state.current];
  paper.dataset.font = page.font;
  paper.style.setProperty('--ink', page.color);
  fontButtons.forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.font === page.font ? 'true' : 'false');
  });
  swatches.forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.color === page.color ? 'true' : 'false');
  });
}

function render() {
  const page = state.pages[state.current];
  title.value = page.title;
  lyrics.value = page.lyrics;
  applyStyle();
  updateDots();
  updateMum();
  prev.disabled = state.current === 0;
  next.disabled = state.current === PAGE_COUNT - 1;
  sheet.setAttribute('aria-labelledby', tabs[state.current].id);
  pageStatus.textContent = `Page ${state.current + 1} of ${PAGE_COUNT}`;
  renderVideos();
}

function goTo(index) {
  if (index < 0 || index >= PAGE_COUNT || index === state.current) return;
  commitFields();
  state.current = index;
  render();
  scheduleSave();
  sheet.classList.remove('turn');
  void sheet.offsetWidth;
  sheet.classList.add('turn');
}

function revokeUrls() {
  for (const url of liveUrls) URL.revokeObjectURL(url);
  liveUrls.clear();
}

function removeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.4');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  return svg;
}

async function warmPoster(video) {
  try {
    await Promise.race([
      (async () => {
        if (video.readyState < 2) {
          await new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', resolve, { once: true });
            video.addEventListener('error', reject, { once: true });
          });
        }
        video.muted = true;
        await video.play();
        video.pause();
        if (video.videoWidth) {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0);
          video.poster = canvas.toDataURL('image/jpeg', 0.86);
        }
        video.currentTime = 0;
        video.muted = false;
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('poster-timeout')), 2500);
      }),
    ]);
  } catch (err) {
    try { video.muted = false; } catch (e) { /* ignore */ }
  }
}

async function renderVideos() {
  const token = ++videoToken;
  revokeUrls();
  const ids = [...state.pages[state.current].videos];
  clips.replaceChildren();
  clips.hidden = ids.length === 0;
  if (!ids.length) return;

  for (const id of ids) {
    const record = await idbGet('videos', id);
    if (token !== videoToken) return;
    const blob = blobFromRecord(record);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    liveUrls.add(url);

    const clip = document.createElement('div');
    clip.className = 'clip';
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = 'auto';
    video.src = url;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    const name = record.name || 'video';
    remove.setAttribute('aria-label', `Remove video ${name}`);
    remove.appendChild(removeIcon());
    remove.addEventListener('click', () => removeVideo(id));
    clip.append(video, remove);
    if (token !== videoToken) return;
    clips.appendChild(clip);
    warmPoster(video);
  }
}

async function removeVideo(id) {
  const page = state.pages[state.current];
  page.videos = page.videos.filter((videoId) => videoId !== id);
  scheduleSave();
  updateDots();
  try {
    await idbDelete('videos', id);
  } catch (err) {
    console.error(err);
  }
  renderVideos();
}

function blobFromRecord(record) {
  if (!record) return null;
  const type = record.type || (record.blob && record.blob.type) || 'video/mp4';
  if (record.buffer) return new Blob([record.buffer], { type });
  if (record.blob) return record.blob.type ? record.blob : new Blob([record.blob], { type });
  return null;
}

async function addVideoFiles(files) {
  const page = state.pages[state.current];
  let added = 0;
  for (const file of files) {
    if (file.type && !file.type.startsWith('video/')) continue;
    const id = crypto.randomUUID();
    try {
      // ArrayBuffer, not Blob: some WebKit builds refuse to store Blob values.
      const buffer = file.buffer || await file.arrayBuffer();
      await idbPut('videos', id, {
        id,
        name: file.name || `video-${id}.mp4`,
        type: file.type || 'video/mp4',
        buffer,
      });
      page.videos.push(id);
      added += 1;
    } catch (err) {
      console.error(err);
      showToast('That video could not be saved on this device.');
    }
  }
  if (added) {
    scheduleSave();
    updateDots();
    await renderVideos();
  }
}

function safeName(name, fallback) {
  const clean = String(name || fallback).replace(/[^\w.\- ]+/g, '').trim().slice(0, 80);
  return clean || fallback;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function shareOrDownload(file) {
  const canShare = typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });
  if (!canShare) {
    downloadFile(file);
    return;
  }
  navigator.share({ files: [file], title: 'Silly Songs' }).catch((err) => {
    if (err && err.name === 'AbortError') return;
    downloadFile(file);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const paragraphs = String(text).split('\n');
  let lineY = y;
  let count = 0;
  const push = (value) => {
    if (count >= maxLines) return false;
    if (value) ctx.fillText(value, x, lineY);
    lineY += lineHeight;
    count += 1;
    return true;
  };
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (!push('')) return;
      continue;
    }
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(trial).width > maxWidth) {
        if (!push(line)) return;
        line = word;
      } else {
        line = trial;
      }
    }
    if (line && !push(line)) return;
  }
}

async function drawPagePng() {
  await document.fonts.ready;
  const page = state.pages[state.current];
  const family = FONT_FAMILY[page.font] || 'Fredoka';
  const weight = page.font === 'hand' ? 400 : 600;
  try {
    await document.fonts.load('600 36px Fredoka');
    await document.fonts.load(`${weight} 72px "${family}"`);
    await document.fonts.load(`${weight} 48px "${family}"`);
  } catch (err) {
    /* Canvas falls back to a generic face if a font is still loading. */
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  const desk = ctx.createLinearGradient(0, 0, 1200, 1600);
  desk.addColorStop(0, '#f8e3d4');
  desk.addColorStop(0.55, '#f7e4f0');
  desk.addColorStop(1, '#e7f3ee');
  ctx.fillStyle = desk;
  ctx.fillRect(0, 0, 1200, 1600);

  roundRect(ctx, 70, 70, 1060, 1460, 40);
  ctx.fillStyle = '#fffaf3';
  ctx.fill();

  ctx.save();
  roundRect(ctx, 70, 70, 1060, 1460, 40);
  ctx.clip();
  ctx.fillStyle = '#f3d5cb';
  ctx.fillRect(70, 70, 86, 1460);
  ctx.fillStyle = '#fffaf3';
  for (let y = 160; y < 1460; y += 92) {
    ctx.beginPath();
    ctx.arc(112, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(980, 150);
  ctx.fillStyle = page.color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(0, 36, 22, 15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(16, -28, 8, 70);
  ctx.beginPath();
  ctx.moveTo(24, -26);
  ctx.quadraticCurveTo(70, -10, 62, 18);
  ctx.quadraticCurveTo(40, 8, 24, -4);
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#8a6078';
  ctx.font = '500 34px Fredoka, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('Silly Songs', 196, 150);
  ctx.globalAlpha = 1;

  ctx.fillStyle = page.color;
  ctx.font = `${weight} 72px "${family}", sans-serif`;
  const titleText = page.title.trim();
  if (titleText) {
    wrapText(ctx, titleText, 196, 230, 760, 84, 3);
  } else {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(196, 300, 760, 4);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = page.color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(196, 500);
  ctx.lineTo(1040, 500);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const lyricWeight = page.font === 'hand' ? 400 : (page.font === 'rounded' ? 500 : 600);
  ctx.font = `${lyricWeight} 48px "${family}", sans-serif`;
  ctx.fillStyle = page.color;
  const lyricText = page.lyrics.trim();
  if (lyricText) {
    wrapText(ctx, lyricText, 196, 540, 840, 72, 11);
  } else {
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillRect(196, 590 + i * 72, 820, 3);
    }
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#8a6078';
  ctx.font = '500 30px Fredoka, sans-serif';
  ctx.fillText(`Page ${state.current + 1} of ${PAGE_COUNT}`, 196, 1428);
  ctx.globalAlpha = 1;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png');
  const pageNumber = state.current + 1;
  return new File([blob], `silly-song-page-${pageNumber}.png`, { type: 'image/png' });
}

async function fileForVideo(id, index) {
  const record = await idbGet('videos', id);
  const blob = blobFromRecord(record);
  if (!blob) return null;
  const type = blob.type || 'video/mp4';
  const extension = type.includes('quicktime') ? 'mov' : 'mp4';
  const base = safeName(record.name, `silly-song-video-${index + 1}.${extension}`);
  const named = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.${extension}`;
  return new File([blob], named, { type });
}

function closeSave() {
  saveLayer.hidden = true;
  pictureFile = null;
  videoFiles = [];
  saveBtn.focus();
}

async function openSave() {
  commitFields();
  saveBtn.disabled = true;
  try {
    pictureFile = await drawPagePng();
    const ids = state.pages[state.current].videos;
    videoFiles = [];
    for (let i = 0; i < ids.length; i += 1) {
      const file = await fileForVideo(ids[i], i);
      if (file) videoFiles.push(file);
    }
    saveTitle.textContent = `Save page ${state.current + 1}`;
    saveHelp.textContent = videoFiles.length
      ? 'Save a picture of the words, or save a video.'
      : 'Save a picture of the words. Add a video if you want to save one too.';
    saveVideos.replaceChildren();
    videoFiles.forEach((file, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = videoFiles.length > 1 ? `Save video ${index + 1}` : 'Save video';
      button.setAttribute('aria-label', `Save video ${file.name}`);
      button.addEventListener('click', () => shareOrDownload(file));
      saveVideos.appendChild(button);
    });
    saveLayer.hidden = false;
    savePicture.focus();
  } catch (err) {
    console.error(err);
    showToast('Could not make the picture just now.');
  } finally {
    saveBtn.disabled = false;
  }
}

let swipe = null;
window.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.binding')) return;
  swipe = { x: event.clientX, y: event.clientY };
});
window.addEventListener('pointerup', (event) => {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
  goTo(state.current + (dx < 0 ? 1 : -1));
});
window.addEventListener('pointercancel', () => {
  swipe = null;
});

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => goTo(index));
});
prev.addEventListener('click', () => goTo(state.current - 1));
next.addEventListener('click', () => goTo(state.current + 1));

title.addEventListener('input', () => {
  state.pages[state.current].title = title.value;
  updateDots();
  scheduleSave();
});
lyrics.addEventListener('input', () => {
  state.pages[state.current].lyrics = lyrics.value;
  updateDots();
  scheduleSave();
});
title.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    lyrics.focus();
  }
});

fontButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.pages[state.current].font = button.dataset.font;
    applyStyle();
    scheduleSave();
  });
});
swatches.forEach((button) => {
  button.addEventListener('click', () => {
    state.pages[state.current].color = button.dataset.color;
    applyStyle();
    scheduleSave();
  });
});

videoInput.addEventListener('change', async () => {
  const incoming = [...videoInput.files];
  if (!incoming.length) return;
  // Read the bytes before clearing the input. WebKit drops the file
  // if the input is reset while something is still reading it.
  const copies = [];
  for (const file of incoming) {
    copies.push({
      name: file.name || 'video.mp4',
      type: file.type || 'video/mp4',
      buffer: await file.arrayBuffer(),
    });
  }
  videoInput.value = '';
  await addVideoFiles(copies);
});

saveBtn.addEventListener('click', () => {
  openSave();
});
savePicture.addEventListener('click', () => {
  if (pictureFile) shareOrDownload(pictureFile);
});
saveClose.addEventListener('click', closeSave);
saveLayer.addEventListener('click', (event) => {
  if (event.target === saveLayer) closeSave();
});
saveCard.addEventListener('click', (event) => {
  event.stopPropagation();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !saveLayer.hidden) {
    closeSave();
    return;
  }
  if (event.target.closest('input, textarea')) return;
  if (event.key === 'ArrowRight') goTo(state.current + 1);
  if (event.key === 'ArrowLeft') goTo(state.current - 1);
});

window.addEventListener('pagehide', () => {
  commitFields();
  scheduleSave();
});

const RELOAD_FLAG = 'silly-songs-sw-reloaded';

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    reloading = true;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    if (registration.waiting && hadController && !sessionStorage.getItem(RELOAD_FLAG)) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          installing.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
    registration.update().catch(() => {});
  } catch (err) {
    console.error(err);
  }
}

async function watchVersion() {
  try {
    const response = await fetch('./version.json', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.version || data.version === VERSION) return;
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
    window.location.reload();
  } catch (err) {
    /* Offline is fine. The saved songbook is already on the device. */
  }
}

async function init() {
  askToKeepStorage();
  try {
    const saved = normaliseBook(await idbGet('kv', 'book'));
    if (saved) state = saved;
    else await idbPut('kv', 'book', snapshot());
    app.dataset.saveState = 'saved';
  } catch (err) {
    console.error(err);
    app.dataset.saveState = 'error';
    showToast('Could not open saved songs. You can still write on this visit.');
  }
  render();
  title.disabled = false;
  lyrics.disabled = false;
  app.classList.remove('is-booting');
  setupServiceWorker();
  watchVersion();
}

init();
