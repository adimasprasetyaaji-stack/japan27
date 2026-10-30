/* Service worker Japan Winter 2027
 * - App shell (HTML/JS/ikon) disimpan agar app terbuka instan & tanpa sinyal.
 * - Font Google disimpan saat pertama dipakai.
 * - Panggilan API Apps Script TIDAK pernah disimpan di sini (data trip dikelola app di localStorage). */
var VERSION = 'jp27-v2026.10.30-1';
var SHELL = ['./', './index.html', './pwa.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k.indexOf('jp27-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return; // API: selalu ke jaringan

  // Halaman app: tampilkan cache dulu (instan), perbarui diam-diam di belakang.
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match('./index.html').then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok) c.put('./index.html', res.clone()); return res; });
        return hit || net.catch(function () { return new Response('Offline', { status: 503 }); });
      });
    }));
    return;
  }

  // File app sendiri & Google Fonts: stale-while-revalidate.
  if (url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        });
        if (hit) { net.catch(function () {}); return hit; }
        return net;
      });
    }));
  }
});
