/* Japan Winter 2027 — lapisan PWA
 * - Menyambungkan app ke Google Sheet lewat Apps Script API (fetch), menggantikan google.script.run
 * - Layar setup (URL API + token), berbagi ke HP lain, hapus data perangkat
 * - Registrasi service worker (offline) dan petunjuk "Add to Home Screen"
 * Tidak ada data trip di file ini; data hanya diambil dari API dan disimpan di perangkat. */
(function () {
  'use strict';
  var APP_VERSION = '2026.10.30-1';
  var CFG_KEY = 'jp27_api_cfg_v1', HINT_KEY = 'jp27_install_hint_off';
  var FNS = ['getAppData', 'updateRecord', 'addItineraryItem', 'refreshGeo', 'ping'];

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var cfg = lsGet(CFG_KEY);
  if (cfg && !(cfg.url && cfg.token)) cfg = null;

  /* ---------- kode setup: JP27-<base64url(JSON)> ---------- */
  function b64u(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
  function makeCode(c) { return 'JP27-' + b64u(JSON.stringify({ u: c.url, t: c.token })); }
  function readCode(s) {
    var m = String(s || '').trim().match(/JP27-([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try { var o = JSON.parse(unb64u(m[1])); return o.u && o.t ? { url: o.u, token: o.t } : null; } catch (e) { return null; }
  }
  function validUrl(u) { return /^https:\/\/script\.google(usercontent)?\.com\/.+\/exec(\?.*)?$/.test(String(u || '').trim()); }

  /* ---------- panggilan API ---------- */
  function api(c, fn, args) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, fn === 'getAppData' ? 30000 : 25000);
    return fetch(c.url, {
      method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token: c.token, fn: fn, args: args || [] })
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('Server ' + r.status);
      return r.text();
    }).then(function (txt) {
      var d;
      try { d = JSON.parse(txt); } catch (e) { throw new Error('Balasan bukan JSON — cek akses deployment = "Anyone"'); }
      if (!d.ok) { var err = new Error(d.error || 'Gagal'); err.code = d.code; throw err; }
      return d.result;
    }, function (e) {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'Waktu habis (sinyal lemah?)' : 'Offline / tidak tersambung');
    });
  }

  /* Pengganti google.script.run: app lama memanggil run.withSuccessHandler(..).withFailureHandler(..)[fn](...) */
  function runner(ok, fail) {
    var r = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); }
    };
    FNS.forEach(function (fn) {
      r[fn] = function () {
        api(cfg, fn, [].slice.call(arguments)).then(function (res) { if (ok) ok(res); }, function (e) {
          if (e.code === 'auth') { openSetup('Token ditolak server. Masukkan token yang baru.'); }
          if (fail) fail(e);
        });
      };
    });
    return r;
  }
  if (cfg) window.google = { script: { run: runner() } };

  /* ---------- UI setup / pengaturan ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.pwa-ov{position:fixed;inset:0;z-index:100;background:var(--bg);overflow:auto;padding:calc(env(safe-area-inset-top,0px) + 20px) 16px calc(env(safe-area-inset-bottom,0px) + 24px)}' +
    '.pwa-box{max-width:520px;margin:0 auto;display:grid;gap:14px}' +
    '.pwa-box h2{margin:0;font-family:var(--display);font-size:24px;font-weight:800}' +
    '.pwa-box p{margin:0;color:var(--muted);font-size:14px}' +
    '.pwa-card{background:var(--surface);border-radius:14px;padding:14px;box-shadow:var(--shadow);display:grid;gap:10px}' +
    '.pwa-card label{display:grid;gap:4px;font-size:13px;color:var(--muted)}' +
    '.pwa-card input,.pwa-card textarea{width:100%;font-size:16px;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px 11px;color:var(--ink);font-family:var(--mono)}' +
    '.pwa-card textarea{min-height:70px;resize:vertical;word-break:break-all}' +
    '.pwa-row{display:flex;gap:8px;flex-wrap:wrap}' +
    '.pwa-btn{border:1px solid var(--line);background:var(--surface);color:var(--indigo);border-radius:10px;padding:10px 14px;font-size:15px;min-height:44px}' +
    '.pwa-btn.pri{background:var(--torii);border-color:var(--torii);color:var(--torii-ink);font-weight:700}' +
    '.pwa-btn.bad{color:var(--bad)}' +
    '.pwa-msg{font-size:14px;border-radius:10px;padding:9px 11px;background:var(--warn-soft)}' +
    '.pwa-msg.ok{background:var(--ok-soft)}.pwa-msg.err{background:var(--bad-soft);color:var(--bad)}' +
    '.pwa-or{text-align:center;font-size:12px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}' +
    '.pwa-meta{font-size:12px;color:var(--muted);font-family:var(--mono)}' +
    '.pwa-hint{position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:30;background:var(--ink);color:var(--bg);border-radius:12px;padding:10px 12px;font-size:13.5px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.25)}' +
    '.pwa-hint button{margin-left:auto;background:none;border:0;color:inherit;font-size:20px;line-height:1;padding:4px 6px}' +
    '.pwa-gear{font-size:16px}.syncbar .btn{white-space:nowrap}';
  document.head.appendChild(css);

  var ov = null;
  function openSetup(msg) {
    if (ov) ov.remove();
    var c = cfg || { url: '', token: '' };
    ov = document.createElement('div');
    ov.className = 'pwa-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="pwa-box">' +
      '<h2>' + (cfg ? 'Pengaturan' : 'Sambungkan ke Google Sheet') + '</h2>' +
      '<p>' + (cfg ? 'App ini tersambung ke database trip. Data terakhir tersimpan di HP ini sehingga tetap bisa dibuka tanpa sinyal.'
        : 'Data trip tidak disimpan di website ini. Tempel <b>kode setup</b> (dari HP pasangan) atau isi URL API + token dari Apps Script.') + '</p>' +
      (msg ? '<div class="pwa-msg err" id="pwaMsg">' + esc(msg) + '</div>' : '<div class="pwa-msg" id="pwaMsg" hidden></div>') +
      '<div class="pwa-card">' +
      '<label>Kode setup<textarea id="pwaCode" placeholder="JP27-…" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea></label>' +
      '<div class="pwa-or">atau</div>' +
      '<label>URL Web App (…/exec)<input id="pwaUrl" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" value="' + esc(c.url) + '" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '<label>Token<input id="pwaTok" autocapitalize="off" autocomplete="off" spellcheck="false" value="' + esc(c.token) + '"></label>' +
      '<div class="pwa-row"><button class="pwa-btn pri" id="pwaSave">Tes &amp; simpan</button>' + (cfg ? '<button class="pwa-btn" id="pwaClose">Tutup</button>' : '') + '</div>' +
      '</div>' +
      (cfg ? '<div class="pwa-card"><b>Pasang di HP lain</b><p>Kirim kode ini lewat WhatsApp ke pasangan, lalu tempel di app miliknya. Kode berisi token: jangan dibagikan ke orang lain.</p>' +
        '<textarea id="pwaShare" readonly>' + esc(makeCode(cfg)) + '</textarea>' +
        '<div class="pwa-row"><button class="pwa-btn" id="pwaCopy">Salin kode</button>' + (navigator.share ? '<button class="pwa-btn" id="pwaSend">Bagikan…</button>' : '') + '</div></div>' +
        '<div class="pwa-card"><b>Perangkat ini</b><p>Hapus koneksi, cache data, dan perubahan yang belum terkirim dari HP ini (data di Google Sheet tidak terhapus).</p>' +
        '<div class="pwa-row"><button class="pwa-btn bad" id="pwaWipe">Hapus data di HP ini</button></div></div>' : '') +
      '<p class="pwa-meta">Versi app ' + APP_VERSION + ' · ' + (navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'mode app (Home Screen)' : 'mode browser') + '</p>' +
      '</div>';
    document.body.appendChild(ov);
    var $ = function (id) { return document.getElementById(id); };
    function say(t, kind) { var m = $('pwaMsg'); m.hidden = false; m.className = 'pwa-msg' + (kind ? ' ' + kind : ''); m.textContent = t; }

    $('pwaCode').addEventListener('input', function () {
      var c2 = readCode(this.value);
      if (c2) { $('pwaUrl').value = c2.url; $('pwaTok').value = c2.token; say('Kode terbaca. Tekan "Tes & simpan".', 'ok'); }
    });
    $('pwaSave').addEventListener('click', function () {
      var c2 = readCode($('pwaCode').value) || { url: $('pwaUrl').value.trim(), token: $('pwaTok').value.trim() };
      if (!validUrl(c2.url)) { say('URL harus URL Web App Apps Script yang diakhiri /exec.', 'err'); return; }
      if (!c2.token) { say('Token wajib diisi.', 'err'); return; }
      var btn = this; btn.disabled = true; say('Menghubungi server…');
      api(c2, 'ping').then(function () {
        lsSet(CFG_KEY, { url: c2.url, token: c2.token, saved_at: new Date().toISOString() });
        say('Tersambung. Memuat data…', 'ok');
        setTimeout(function () { location.reload(); }, 400);
      }, function (e) { btn.disabled = false; say('Gagal: ' + e.message, 'err'); });
    });
    if ($('pwaClose')) $('pwaClose').addEventListener('click', function () { ov.remove(); ov = null; });
    if ($('pwaCopy')) $('pwaCopy').addEventListener('click', function () {
      var t = $('pwaShare');
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(function () { say('Kode disalin.', 'ok'); }, function () { t.select(); say('Tekan lama lalu Salin.', ''); });
    });
    if ($('pwaSend')) $('pwaSend').addEventListener('click', function () {
      navigator.share({ title: 'Kode setup Japan 27', text: $('pwaShare').value }).catch(function () {});
    });
    if ($('pwaWipe')) $('pwaWipe').addEventListener('click', function () {
      if (!confirm('Hapus koneksi dan semua data trip di HP ini?')) return;
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('jp27_') === 0) localStorage.removeItem(k); }); } catch (e) {}
      var done = function () { location.reload(); };
      if (window.caches) caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(done, done); else done();
    });
  }
  window.JP27 = { openSetup: openSetup, version: APP_VERSION };

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-pwa="settings"]');
    if (b) { e.preventDefault(); openSetup(); }
  });

  if (!cfg) openSetup();

  /* ---------- petunjuk pasang di iPhone ---------- */
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (ios && !standalone && !lsGet(HINT_KEY)) {
    var h = document.createElement('div');
    h.className = 'pwa-hint';
    h.innerHTML = '<span>Pasang sebagai app: tombol <b>Share</b> ⬆︎ → <b>Add to Home Screen</b>. Lakukan setup di app yang sudah terpasang.</span><button aria-label="Tutup">×</button>';
    h.querySelector('button').addEventListener('click', function () { lsSet(HINT_KEY, 1); h.remove(); });
    document.body.appendChild(h);
  }

  /* ---------- service worker ---------- */
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && secure) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing; if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              var t = document.getElementById('toast');
              if (t) { t.textContent = 'Versi app baru siap — tutup lalu buka lagi app'; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 5000); }
            }
          });
        });
      }).catch(function () {});
    });
  }
})();
