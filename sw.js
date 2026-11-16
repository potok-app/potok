/* sw.js – service worker: zapamiętuje pliki aplikacji, żeby działała offline.
   Przy każdej zmianie plików podbij WERSJA – wtedy telefon pobierze nowe.
   Test (testy/test-spojnosci.js) pilnuje, żeby WERSJA = WERSJA_APLIKACJI
   z js/app.js, a PLIKI zawierały każdy skrypt i styl z index.html. */
const WERSJA = 'potok-v30';
const PLIKI = ['./', 'index.html', 'styl.css', 'manifest.webmanifest', 'ikona.svg',
  'js/bledy.js', 'js/scal.js', 'js/magazyn.js', 'js/zip.js', 'js/import.js', 'js/eksport.js',
  'js/skrypt-google.js', 'js/synchronizacja.js', 'js/opisy.js', 'js/streszczenia.js', 'js/app.js'];
// Pełne adresy plików aplikacji – tylko one trafiają do pamięci.
const ADRESY = new Set(PLIKI.map(p => new URL(p, self.location).href));
const START = new URL('./', self.location).href;

self.addEventListener('install', e => e.waitUntil(caches.open(WERSJA).then(c => c.addAll(PLIKI))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(n => n !== WERSJA).map(n => caches.delete(n))))));
// Najpierw sieć (świeża wersja), a bez sieci – kopia z pamięci.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Google (skrypt) – zawsze prosto do sieci, nic nie zapamiętujemy.
  if (!e.request.url.startsWith(self.location.origin)) return;
  const url = new URL(e.request.url);
  // Otwarcie strony (także z udostępnienia ?url=…) zapamiętujemy pod jednym
  // adresem bez parametrów – w pamięci nie zostają udostępnione linki.
  const nawigacja = e.request.mode === 'navigate';
  const klucz = nawigacja ? START : url.origin + url.pathname;
  const zapamietac = nawigacja || (!url.search && ADRESY.has(klucz));
  // cache: 'no-cache' – nie bierz starej kopii z pamięci przeglądarki
  // (GitHub Pages pozwala jej trzymać pliki do 10 minut), zawsze pytaj serwer.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then(r => {
    // Tylko poprawne odpowiedzi (nie 404 / 500).
    if (r.ok && zapamietac) {
      const kopia = r.clone();
      caches.open(WERSJA).then(c => c.put(klucz, kopia));
    }
    return r;
  }).catch(() => caches.match(klucz).then(r => r || caches.match(e.request, { ignoreSearch: true }))));
});
