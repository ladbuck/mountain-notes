/* Mountain Notes offline support.
   The app page is fetched fresh when online (so new deployments show up at once)
   and served from the cache when offline. Google sign-in and Drive are never cached. */
const CACHE = 'mountain-notes-v3';   // v3: new storage layout, Share to Mountain Notes. Renaming the cache drops the old offline copy.
const SHARED = 'mountain-notes-shared';   // files shared from other apps wait here until the app picks them up
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'icon.svg'];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARED).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Android: Share → Mountain Notes sends the files here (see share_target in manifest.webmanifest).
   They are kept for the app, which then opens at /?share=<id> and imports them. */
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll('files').filter(f => f && typeof f === 'object' && 'size' in f);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), c = await caches.open(SHARED);
    await Promise.all(files.map((f, i) => c.put(`/__shared/${id}/${i}`, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name || 'shared file') } }))));
    return Response.redirect(new URL('/?share=' + id, location.origin).href, 303);
  } catch (err) {
    return Response.redirect(new URL('/?share=error', location.origin).href, 303);
  }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname === '/share-target') { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;   // sign-in is never cached
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
      e.respondWith(fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); }
        return res;
      }).catch(() => caches.match('index.html').then(r => r || caches.match('./'))));
      return;
    }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
