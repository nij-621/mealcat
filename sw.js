// Mealcat SW — network first (updates land right away), cache fallback for offline
const CACHE = 'mealcat-v1.6'; // app.js의 VERSION과 같이 올림
const SHELL = ['./', './index.html', './style.css', './app.js', './zip.js', './manifest.webmanifest', './icon-180.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !font) return;
  e.respondWith(
    // 같은 출처는 HTTP 캐시(Pages max-age=600)를 건너뛰고 서버에 확인 — 배포가 다음 실행에 바로 보이게
    fetch(e.request, font ? {} : { cache: 'no-cache' }).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
