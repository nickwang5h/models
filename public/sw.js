// Offline use and "add to home screen". Pages come fresh from the network when it answers in time, else from the copy kept here;
// after install every card is fetched in the background, so the whole lattice reads offline. Progress stays in localStorage.
const CACHE = 'models-v7';
const SHELL = ['/', '/style.css', '/app.js', '/progress.mjs', '/quiz.mjs', '/display.mjs', '/keys.mjs', '/list.mjs', '/daily.mjs', '/figure.mjs', '/figs.js', '/i18n.mjs', '/questions.json', '/qn.json', '/ids.json', '/review', '/icon.svg',
  '/fonts/inter-latin.woff2',
  '/icons/icon-192.png', '/manifest.webmanifest'];
const WAIT = 3000;   // after this long without the network, the kept copy is shown
const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((file) => new Request(file, {cache: 'reload'})))).then(() => self.skipWaiting()));
});

// Every card, a few at a time; a failure leaves that card to be kept when it is first read.
async function keepCards() {
  const cache = await caches.open(CACHE);
  const ids = await (await fetch('/ids.json')).json();
  for (let start = 0; start < ids.length; start += 6) {
    await Promise.all(ids.slice(start, start + 6).map(async (id) => {
      const url = `/m/${id}`;
      if (await cache.match(url)) return;
      const response = await fetch(url).catch(() => null);
      if (response?.ok) await cache.put(url, response);
    }));
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith('models-') && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
    .then(() => { keepCards().catch(() => {}); }));
});

async function fresh(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  const late = new Promise((resolve) => setTimeout(resolve, WAIT));
  const first = await Promise.race([network.catch(() => null), late]);
  if (first) return first;
  return (await cache.match(request, {ignoreSearch: true})) ?? network;
}

// Files that never change under the same name (KaTeX and its fonts, the icons, our font): the kept copy first.
async function kept(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.url.startsWith(KATEX) || (url.origin === self.location.origin && (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/')))) return event.respondWith(kept(request));
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;   // confirmation links and the like stay out of the cache
  event.respondWith(fresh(request));
});
