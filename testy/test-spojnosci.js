/* test-spojnosci.js – rzeczy, które dawniej trzeba było pilnować ręcznie:
   - WERSJA w sw.js = WERSJA_APLIKACJI w js/app.js (telefon pobierze nową wersję),
   - każdy skrypt i styl z index.html jest na liście PLIKI w sw.js (działa offline),
   - każdy plik z PLIKI istnieje i trafia na stronę (lista w workflow),
   - index.html ma Content-Security-Policy i nie ładuje obcych skryptów.
   Użycie: node testy/test-spojnosci.js */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const KATALOG = path.resolve(__dirname, '..');
const czytaj = p => fs.readFileSync(path.join(KATALOG, p), 'utf8');

const sw = czytaj('sw.js'), app = czytaj('js/app.js'), html = czytaj('index.html');
const wersjaSw = (sw.match(/const WERSJA = 'potok-v(\d+)'/) || [])[1];
const wersjaApp = (app.match(/const WERSJA_APLIKACJI = (\d+);/) || [])[1];
assert(wersjaSw && wersjaApp, 'nie znaleziono numerów wersji');
assert.strictEqual(wersjaSw, wersjaApp, `sw.js ma wersję ${wersjaSw}, a app.js ${wersjaApp} – podbij obie`);

const PLIKI = eval((sw.match(/const PLIKI = (\[[\s\S]*?\]);/) || [])[1]);
const wHtml = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)].map(m => m[1]);
for (const p of wHtml) {
  assert(!/^(https?:)?\/\//.test(p), 'index.html ładuje plik z innego serwera: ' + p);
  assert(PLIKI.includes(p), `${p} jest w index.html, ale nie ma go w PLIKI w sw.js (nie zadziała offline)`);
}
for (const p of PLIKI.filter(p => p !== './')) assert(fs.existsSync(path.join(KATALOG, p)), 'w PLIKI jest plik, którego nie ma: ' + p);

// Workflow publikuje tylko pliki strony – wszystkie z PLIKI muszą tam być.
const workflow = czytaj('.github/workflows/testy-i-strona.yml');
for (const p of PLIKI.filter(p => p !== './' && !p.startsWith('js/'))) assert(workflow.includes(p), `workflow nie publikuje ${p}`);
assert(/cp -r js _strona/.test(workflow), 'workflow nie publikuje katalogu js');

assert(/http-equiv="Content-Security-Policy"/.test(html), 'brak Content-Security-Policy w index.html');
assert(!/accounts\.google\.com/.test(html), 'index.html ładuje skrypt Google (niepotrzebny)');
assert(!/\son\w+="/.test(html), 'index.html ma kod w atrybutach (onclick=…) – CSP go zablokuje');
console.log(`Spójność: OK (wersja ${wersjaApp}, ${PLIKI.length} plików offline, CSP)`);
