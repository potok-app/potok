// e2e-offline.js – aplikacja z prawdziwego adresu http (jak GitHub Pages),
// z service workerem: działa bez internetu, a „Udostępnij → Potok” bez sieci
// też dodaje wpis. Do tego zabezpieczenia z audytu (16.11.2026), które
// działają tylko z adresu http(s): Content-Security-Policy, ochrona przed
// ramką, pamięć service workera, złośliwe linki „udostępnij”.
// Uruchom: node testy/e2e-offline.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const KATALOG = path.join(__dirname, '..');
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// Mały serwer plików, z nagłówkiem jak na GitHub Pages (pamięć 10 minut).
const serwer = http.createServer((req, res) => {
  let plik = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (plik.endsWith('/')) plik += 'index.html';
  const sciezka = path.join(KATALOG, plik);
  if (!sciezka.startsWith(KATALOG) || !fs.existsSync(sciezka)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPY[path.extname(sciezka)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
  fs.createReadStream(sciezka).pipe(res);
});

(async () => {
  await new Promise(r => serwer.listen(0, r));
  const ADRES = `http://localhost:${serwer.address().port}/`;
  const przegladarka = await chromium.launch();
  const kontekst = await przegladarka.newContext();
  const s = await kontekst.newPage();
  const bledy = [];
  s.on('pageerror', e => bledy.push(e.message));
  // Naruszenia Content-Security-Policy trafiają do konsoli.
  const csp = [];
  s.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });

  // 1. Pierwsze otwarcie z internetem – service worker zapamiętuje pliki.
  await s.goto(ADRES);
  await s.evaluate(() => navigator.serviceWorker.ready);
  await s.reload();
  await s.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.match(await s.locator('#wersja').textContent(), /Wersja aplikacji: \d+/);

  // 2. Bez internetu: aplikacja się otwiera, udostępnienie dodaje wpis.
  await kontekst.setOffline(true);
  await s.goto(ADRES + '?title=Bez%20sieci&text=' + encodeURIComponent('https://youtu.be/offline1'));
  const ile = await s.evaluate(() => Magazyn.wczytaj().filter(w => w.url === 'https://youtu.be/offline1').length);
  assert.strictEqual(ile, 1, 'udostępnienie bez internetu nie dodało wpisu');

  console.log('1–2. Offline: aplikacja się otwiera, udostępnienie bez sieci dodaje wpis.');
  await kontekst.setOffline(false);

  // 3. Zepsuty adres udostępnienia (B-06): aplikacja startuje, adres wyczyszczony.
  await s.goto(ADRES + '?text=%E0%A4%A&title=100%');
  await s.waitForSelector('#widok-dodaj', { state: 'visible' });
  assert.strictEqual(new URL(s.url()).search, '', 'adres nie został wyczyszczony');
  console.log('3. Zepsuty adres udostępnienia nie zatrzymuje aplikacji.');

  // 4. Cudzy link z „javascript:” (B-02): wpis jest notatką, widać „Cofnij”.
  await s.goto(ADRES + '?title=' + encodeURIComponent('Ciekawy artykuł') + '&url=' + encodeURIComponent('javascript:window.__xss=1'));
  await s.waitForSelector('#komunikat button');
  const podrzucony = await s.evaluate(() => Magazyn.wczytaj().find(w => w.tytul === 'Ciekawy artykuł'));
  assert.strictEqual(podrzucony.url, null, 'adres javascript: zapisany jako link');
  assert.strictEqual(await s.locator('a[href^="javascript"]').count(), 0, 'link javascript: na stronie');
  await s.click('#komunikat button');
  assert.strictEqual(await s.evaluate(id => Magazyn.wczytaj().find(w => w.id === id).status, podrzucony.id), 'archiwum', '„Cofnij” nie przeniosło do Archiwum');
  console.log('4. Link „javascript:” z udostępnienia → notatka; „Cofnij” przenosi do Archiwum.');

  // 5. Złośliwy identyfikator i tytuł z kopii (B-03): żadnego kodu w HTML.
  await s.evaluate(() => {
    const zly = { id: 'x" onfocus="window.__xss=1" autofocus="', url: 'javascript:window.__xss=1', tytul: '<img src=x onerror="window.__xss=1">',
      tekst: 'zły', status: 'obczaic', dodano: '2026-11-01T10:00:00Z', historia: [], kolejnosc: 0 };
    Magazyn.przywrocKopie(JSON.stringify({ wersja: 1, wpisy: [zly] }));
  });
  await s.click('nav [data-widok=listy]');
  await s.click('#statusy [data-lista=obczaic]');
  assert.strictEqual(await s.locator('#lista [onfocus], #lista img, #lista a[href^="javascript"]').count(), 0, 'wstrzyknięty HTML na liście');
  await s.locator('#lista button').first().focus();
  // 6. CSP: nawet gdyby HTML się przedostał, kod w atrybucie się nie wykona.
  await s.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<img src="x" onerror="window.__xss=1">'));
  await s.waitForTimeout(300);
  assert.strictEqual(await s.evaluate(() => window.__xss), undefined, 'wykonał się wstrzyknięty kod');
  assert(csp.length > 0, 'CSP nie zablokowała wstrzykniętego kodu');
  csp.length = 0;
  console.log('5–6. Złośliwy id/tytuł nie staje się HTML-em; CSP blokuje wstrzyknięty kod.');

  // 7. Ramka na cudzej stronie: Potok się nie uruchamia.
  const obca = await kontekst.newPage();
  await obca.goto(ADRES.replace('localhost', '127.0.0.1') + 'nie-ma');
  await obca.evaluate(a => { const f = document.createElement('iframe'); f.src = a; document.body.append(f); }, ADRES);
  const ramka = await (await obca.waitForSelector('iframe')).contentFrame();
  await ramka.waitForFunction(() => /nie otwiera się wewnątrz/.test(document.body.textContent));
  await obca.close();
  console.log('7. W ramce na cudzej stronie Potok się nie uruchamia.');

  // 8. Service worker (B-12): w pamięci brak adresów z udostępnień i odpowiedzi z błędem.
  await s.evaluate(() => fetch('js/nie-ma.js').catch(() => {}));
  await s.waitForTimeout(300);
  const klucze = await s.evaluate(async () => (await Promise.all((await caches.keys()).map(async n => (await (await caches.open(n)).keys()).map(r => r.url)))).flat());
  assert(klucze.length > 5, 'pusta pamięć service workera');
  assert(!klucze.some(k => k.includes('?')), 'w pamięci są adresy z parametrami: ' + klucze.filter(k => k.includes('?')));
  assert(!klucze.some(k => k.includes('nie-ma')), 'w pamięci jest odpowiedź 404');
  console.log('8. Pamięć service workera: tylko pliki aplikacji.');

  // 9. Błąd w aplikacji nie ginie po cichu (A-05): komunikat i Pliki → Diagnostyka.
  await s.evaluate(() => setTimeout(() => { throw new Error('test błędu #KLUCZ12345678'); }));
  await s.waitForFunction(() => Bledy.lista().length > 0);
  assert.match(await s.textContent('#komunikat'), /Coś poszło nie tak/);
  await s.click('nav [data-widok=eksport]');
  assert(await s.isVisible('#diagnostyka'), 'brak sekcji Diagnostyka');
  const diag = await s.textContent('#diagnostyka-lista');
  assert(diag.includes('test błędu') && !diag.includes('KLUCZ12345678'), 'diagnostyka bez błędu albo z kluczem');
  bledy.splice(bledy.findIndex(b => b.includes('test błędu')), 1);
  console.log('9. Błąd widoczny na ekranie i w Pliki → Diagnostyka (bez klucza).');

  // 10. Uszkodzone dane w przeglądarce: czerwony pasek, nic nie nadpisane (B-01).
  await s.evaluate(() => localStorage.setItem('potok.v1', '{"wersja":1,"wpisy":[{"id"'));
  await s.goto(ADRES);
  await s.waitForSelector('#alarm', { state: 'visible' });
  assert.strictEqual(await s.evaluate(() => localStorage.getItem('potok.v1')), '{"wersja":1,"wpisy":[{"id"', 'uszkodzone dane nadpisane');
  console.log('10. Uszkodzone dane: czerwony pasek z decyzją, dane nienaruszone.');

  assert.deepStrictEqual(csp, [], 'naruszenia Content-Security-Policy w zwykłym działaniu');
  assert.deepStrictEqual(bledy, [], 'błędy JavaScript na stronie');
  console.log('E2E OFFLINE OK');
  await przegladarka.close();
  serwer.close();
})().catch(e => { console.error('E2E OFFLINE BŁĄD:', e.message); process.exit(1); });
